package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardChallengeResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardItem;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.WealthButtonLeaderboardEntry;
import run.runnable.numfeelservice.model.GameplayEntities.WealthButtonStats;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 50%财富按钮 — 排行榜与统计业务逻辑。
 * <p>
 * 功能：
 * 1. 聚合统计（参与人数/破产人数/资产过亿）— 替代外部 counter API
 * 2. 排行榜提交（challenge + PoW 验证 + 去重）
 * 3. 排行榜查询（资产 top10 + 收益率 top10，按用户名去重）
 */
@Service
public class WealthButtonService {

    /** 单局固定手续费。 */
    static final double ROUND_FEE = 5D;

    /** PoW 难度：哈希前缀需要的十六进制 '0' 数量。 */
    static final int POW_DIFFICULTY = 4;

    /** challenge 有效窗口：5 分钟。 */
    static final long CHALLENGE_WINDOW_MS = 5 * 60 * 1000L;

    /** 紧凑历史最大长度，避免超长 payload。 */
    private static final int MAX_ROUND_HISTORY_LENGTH = 2000;

    /** 已使用 PoW 哈希缓存（防重放）。 */
    private final Cache<String, Boolean> usedPowHashes = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(CHALLENGE_WINDOW_MS))
            .maximumSize(10000)
            .build();

    /** challenge 缓存。 */
    private final Cache<String, ChallengeState> challengeCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(CHALLENGE_WINDOW_MS))
            .maximumSize(10000)
            .build();

    private final R2dbcEntityTemplate template;
    private final DatabaseClient databaseClient;

    public WealthButtonService(R2dbcEntityTemplate template, DatabaseClient databaseClient) {
        this.template = template;
        this.databaseClient = databaseClient;
    }

    // ── 统计相关 ──────────────────────────────────────────────────────

    /**
     * 递增指定统计字段。
     *
     * @param field players / bankrupt / billionaire
     */
    public Mono<Void> incrementStat(String field) {
        if (!isValidStatField(field)) {
            return Mono.error(new IllegalArgumentException("Invalid stat field: " + field));
        }
        // 先确保行存在
        String upsertSql = "INSERT INTO wealth_button_stats (id, players, bankrupt, billionaire) " +
                "VALUES (1, 0, 0, 0) ON DUPLICATE KEY UPDATE id = id";
        String incrSql = "UPDATE wealth_button_stats SET " + field + " = " + field + " + 1 WHERE id = 1";
        return databaseClient.sql(upsertSql).then()
                .then(databaseClient.sql(incrSql).then());
    }

    /** 查询聚合统计。 */
    public Mono<WealthButtonStatsResponse> getStats() {
        String sql = "INSERT INTO wealth_button_stats (id, players, bankrupt, billionaire) " +
                "VALUES (1, 0, 0, 0) ON DUPLICATE KEY UPDATE id = id";
        return databaseClient.sql(sql).then()
                .then(template.select(WealthButtonStats.class).first())
                .map(row -> new WealthButtonStatsResponse(row.players(), row.bankrupt(), row.billionaire()))
                .defaultIfEmpty(new WealthButtonStatsResponse(0, 0, 0));
    }

    // ── 排行榜相关 ────────────────────────────────────────────────────

    /**
     * 生成一次性 challenge，供前端计算排行榜提交 PoW。
     *
     * @return challenge 信息
     */
    public Mono<WealthButtonLeaderboardChallengeResponse> createLeaderboardChallenge() {
        long expiresAt = System.currentTimeMillis() + CHALLENGE_WINDOW_MS;
        String challengeId = UUID.randomUUID().toString();
        challengeCache.put(challengeId, new ChallengeState(expiresAt));
        return Mono.just(new WealthButtonLeaderboardChallengeResponse(challengeId, expiresAt, POW_DIFFICULTY));
    }

    /**
     * 提交排行榜成绩（v2）。
     * <p>
     * 后端基于 {@code initialWealth + roundHistory} 重算最终资产与收益率，
     * 不再信任客户端上传的结果。
     */
    public Mono<WealthButtonLeaderboardSubmitResponse> submitLeaderboardV2(
            String username, int initialWealth, String roundHistory,
            String challengeId, String powHash, String powNonce) {

        GameReplayResult replayResult;
        try {
            replayResult = replayGame(initialWealth, roundHistory);
        } catch (IllegalArgumentException e) {
            return Mono.error(e);
        }

        String validationError = consumeAndValidateChallenge(
                challengeId, username, initialWealth, roundHistory, powHash, powNonce);
        if (validationError != null) {
            return Mono.error(new IllegalArgumentException(validationError));
        }
        markPowUsed(powHash);

        WealthButtonLeaderboardEntry entity = new WealthButtonLeaderboardEntry(
                null, username, replayResult.finalWealth(), replayResult.returnRate(),
                replayResult.pressCount(), replayResult.winCount(), initialWealth,
                roundHistory, powHash, powNonce, System.currentTimeMillis());

        return template.insert(WealthButtonLeaderboardEntry.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, WealthButtonLeaderboardEntry.class))
                .map(rows -> computeRanks(rows, username, replayResult.finalWealth(), replayResult.returnRate()));
    }

    /** 查询排行榜 top N（按用户名去重）。 */
    public Mono<WealthButtonLeaderboardResponse> getLeaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 10);
        return ServiceSupport.selectAll(template, WealthButtonLeaderboardEntry.class)
                .map(rows -> buildLeaderboardResponse(rows, safeLimit));
    }

    // ── PoW 验证 ──────────────────────────────────────────────────────

    /**
     * 消费并验证 challenge + PoW。
     *
     * @return null 表示通过，否则返回错误信息
     */
    String consumeAndValidateChallenge(String challengeId, String username, int initialWealth,
                                       String roundHistory, String powHash, String powNonce) {
        if (challengeId == null || challengeId.isBlank()) {
            return "challengeId is required";
        }
        if (powHash == null || powHash.isBlank()) {
            return "powHash is required";
        }
        if (powNonce == null || powNonce.isBlank()) {
            return "powNonce is required";
        }
        if (usedPowHashes.getIfPresent(powHash) != null) {
            return "PoW already used";
        }
        ChallengeState challengeState = challengeCache.asMap().remove(challengeId);
        long now = System.currentTimeMillis();
        if (challengeState == null || challengeState.expiresAt() < now) {
            return "Challenge expired or already used";
        }
        String payload = buildChallengePowPayload(challengeId, username, initialWealth, roundHistory);
        String expectedHash = sha256(payload + powNonce);
        if (!expectedHash.equals(powHash)) {
            return "PoW hash mismatch";
        }
        if (!meetsPoWDifficulty(powHash)) {
            return "PoW difficulty not met";
        }
        return null;
    }

    /** 构建 v2 PoW payload 字符串（与前端一致）。 */
    static String buildChallengePowPayload(String challengeId, String username, int initialWealth, String roundHistory) {
        return challengeId + "|" + username + "|" + initialWealth + "|" + roundHistory;
    }

    /** 检查哈希是否满足难度要求。 */
    static boolean meetsPoWDifficulty(String hash) {
        if (hash == null || hash.length() < POW_DIFFICULTY) return false;
        for (int i = 0; i < POW_DIFFICULTY; i++) {
            if (hash.charAt(i) != '0') return false;
        }
        return true;
    }

    /** 计算 SHA-256 哈希。 */
    static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder(64);
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    // ── 数据校验 ──────────────────────────────────────────────────────

    /**
     * 按服务器规则回放整局，重算结果。
     *
     * @param initialWealth 初始资金
     * @param roundHistory 紧凑历史
     * @return 重算结果
     */
    GameReplayResult replayGame(int initialWealth, String roundHistory) {
        if (initialWealth <= 0) {
            throw new IllegalArgumentException("invalid initialWealth");
        }
        if (roundHistory == null || roundHistory.isEmpty()) {
            throw new IllegalArgumentException("roundHistory required");
        }
        if (roundHistory.length() > MAX_ROUND_HISTORY_LENGTH) {
            throw new IllegalArgumentException("roundHistory too long");
        }

        double wealth = initialWealth;
        int winCount = 0;
        for (int i = 0; i < roundHistory.length(); i++) {
            if (wealth < 1D) {
                throw new IllegalArgumentException("roundHistory continues after bankruptcy");
            }
            char round = roundHistory.charAt(i);
            if (round == 'W') {
                wealth *= 9D;
                winCount++;
            } else if (round == 'L') {
                wealth *= 0.1D;
            } else {
                throw new IllegalArgumentException("roundHistory contains invalid char");
            }
            wealth -= ROUND_FEE;
            if (wealth < 0D) {
                wealth = 0D;
            }
        }

        int pressCount = roundHistory.length();
        double returnRate = (wealth / initialWealth - 1D) * 100D;
        return new GameReplayResult(pressCount, winCount, wealth, returnRate);
    }

    // ── 私有辅助方法 ──────────────────────────────────────────────────

    private boolean isValidStatField(String field) {
        return "players".equals(field) || "bankrupt".equals(field) || "billionaire".equals(field);
    }

    private void markPowUsed(String powHash) {
        usedPowHashes.put(powHash, Boolean.TRUE);
    }

    /** 计算当前提交在资产和收益率两个榜的排名。 */
    private WealthButtonLeaderboardSubmitResponse computeRanks(
            List<WealthButtonLeaderboardEntry> rows, String username, double finalWealth, double returnRate) {
        // 按用户名去重：每人只取最高资产
        Map<String, Double> bestWealth = new java.util.HashMap<>();
        Map<String, Double> bestReturn = new java.util.HashMap<>();
        for (WealthButtonLeaderboardEntry r : rows) {
            bestWealth.merge(r.username(), r.finalWealth(), Math::max);
            bestReturn.merge(r.username(), r.returnRate(), Math::max);
        }

        // 计算当前用户的排名
        double myBestWealth = bestWealth.getOrDefault(username, finalWealth);
        double myBestReturn = bestReturn.getOrDefault(username, returnRate);

        long wealthRank = bestWealth.values().stream().filter(v -> v > myBestWealth).count() + 1;
        long returnRank = bestReturn.values().stream().filter(v -> v > myBestReturn).count() + 1;

        return new WealthButtonLeaderboardSubmitResponse(
                (int) wealthRank, (int) returnRank, bestWealth.size());
    }

    /** 构建完整排行榜响应（按用户名去重，各取 top N）。 */
    private WealthButtonLeaderboardResponse buildLeaderboardResponse(
            List<WealthButtonLeaderboardEntry> rows, int limit) {

        // 资产排行：每用户取最高资产那条记录
        Map<String, WealthButtonLeaderboardEntry> bestWealthEntries = new java.util.HashMap<>();
        for (WealthButtonLeaderboardEntry r : rows) {
            bestWealthEntries.merge(r.username(), r,
                    (a, b) -> a.finalWealth() >= b.finalWealth() ? a : b);
        }
        List<WealthButtonLeaderboardEntry> wealthSorted = ServiceSupport.sorted(
                new ArrayList<>(bestWealthEntries.values()),
                Comparator.comparingDouble(WealthButtonLeaderboardEntry::finalWealth).reversed()
                        .thenComparingLong(WealthButtonLeaderboardEntry::createdAt));

        // 收益率排行：每用户取最高收益率那条记录
        Map<String, WealthButtonLeaderboardEntry> bestReturnEntries = new java.util.HashMap<>();
        for (WealthButtonLeaderboardEntry r : rows) {
            bestReturnEntries.merge(r.username(), r,
                    (a, b) -> a.returnRate() >= b.returnRate() ? a : b);
        }
        List<WealthButtonLeaderboardEntry> returnSorted = ServiceSupport.sorted(
                new ArrayList<>(bestReturnEntries.values()),
                Comparator.comparingDouble(WealthButtonLeaderboardEntry::returnRate).reversed()
                        .thenComparingLong(WealthButtonLeaderboardEntry::createdAt));

        List<WealthButtonLeaderboardItem> byWealth = new ArrayList<>();
        int rank = 1;
        for (WealthButtonLeaderboardEntry e : wealthSorted.stream().limit(limit).toList()) {
            byWealth.add(toItem(e, rank++));
        }

        List<WealthButtonLeaderboardItem> byReturn = new ArrayList<>();
        rank = 1;
        for (WealthButtonLeaderboardEntry e : returnSorted.stream().limit(limit).toList()) {
            byReturn.add(toItem(e, rank++));
        }

        long totalUsers = bestWealthEntries.size();
        return new WealthButtonLeaderboardResponse(byWealth, byReturn, totalUsers);
    }

    private WealthButtonLeaderboardItem toItem(WealthButtonLeaderboardEntry e, int rank) {
        return new WealthButtonLeaderboardItem(
                rank, e.username(), e.finalWealth(), e.returnRate(),
                e.pressCount(), e.winCount(), e.initialWealth(),
                e.roundHistory(), e.createdAt());
    }

    record ChallengeState(long expiresAt) {
    }

    record GameReplayResult(int pressCount, int winCount, double finalWealth, double returnRate) {
    }
}
