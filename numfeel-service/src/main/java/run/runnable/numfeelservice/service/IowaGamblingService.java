package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardChallengeResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingLeaderboardRecord;
import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingResult;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 爱荷华赌博任务 — 业务逻辑层。
 * 负责持久化完整牌局结果，聚合全站统计，并维护带防刷机制的排行榜。
 */
@Service
public class IowaGamblingService {

    private static final Logger log = LoggerFactory.getLogger(IowaGamblingService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** PoW 难度：哈希前缀需要的十六进制 '0' 数量。 */
    static final int POW_DIFFICULTY = 4;

    /** challenge 有效窗口：5 分钟。 */
    static final long CHALLENGE_WINDOW_MS = 5 * 60 * 1000L;

    /** 同一用户名提交冷却时间：10 秒。 */
    static final long SUBMIT_COOLDOWN_MS = 10_000L;

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

    /** 用户名最近一次提交时间（毫秒），用于实现 10 秒冷却。 */
    private final Cache<String, Long> lastSubmitAt = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(SUBMIT_COOLDOWN_MS * 2))
            .maximumSize(10000)
            .build();

    private final R2dbcEntityTemplate template;
    private final DatabaseClient databaseClient;
    private final TurnstileVerifier turnstileVerifier;

    public IowaGamblingService(R2dbcEntityTemplate template, DatabaseClient databaseClient,
                               TurnstileVerifier turnstileVerifier) {
        this.template = template;
        this.databaseClient = databaseClient;
        this.turnstileVerifier = turnstileVerifier;
    }

    /**
     * 提交一次完整的爱荷华赌博任务牌局结果。
     *
     * @param sessionId   客户端生成的会话 ID
     * @param totalRounds 实际完成手数（1~100）
     * @param finalMoney  结束时的资金
     * @param netScore    净分数 (C+D选数)-(A+B选数)
     * @param bankrupt    是否破产结束
     * @param deckPicks   四堆选牌次数 JSON 数组字符串
     * @param blockScores 每 20 手净分数 JSON 数组字符串
     * @return 完成信号
     */
    public Mono<Void> submit(String sessionId, int totalRounds, int finalMoney, int netScore,
                             boolean bankrupt, String deckPicks, String blockScores) {
        IowaGamblingResult entity = new IowaGamblingResult(
                null, sessionId, totalRounds, finalMoney, netScore,
                bankrupt, deckPicks, blockScores, System.currentTimeMillis());
        return template.insert(IowaGamblingResult.class).using(entity).then();
    }

    /**
     * 查询全站统计：总牌局数、平均净分数、平均最终资金、破产率、各堆平均选牌次数、每 20 手平均净分数。
     *
     * @return 聚合统计响应
     */
    public Mono<IowaGamblingStatsResponse> stats() {
        return ServiceSupport.selectAll(template, IowaGamblingResult.class)
                .map(rows -> {
                    if (rows.isEmpty()) {
                        return new IowaGamblingStatsResponse(0, 0, 0, 0, List.of(), List.of());
                    }
                    long total = rows.size();
                    double avgNet = ServiceSupport.round(
                            rows.stream().mapToInt(IowaGamblingResult::netScore).average().orElse(0), 1);
                    double avgMoney = ServiceSupport.round(
                            rows.stream().mapToInt(IowaGamblingResult::finalMoney).average().orElse(0), 1);
                    double bankruptRate = ServiceSupport.round(
                            rows.stream().filter(IowaGamblingResult::bankrupt).count() / (double) total, 2);

                    List<Double> avgPicks = averageDeckPicks(rows);
                    List<Double> avgBlocks = averageBlockScores(rows);
                    return new IowaGamblingStatsResponse(total, avgNet, avgMoney, bankruptRate, avgPicks, avgBlocks);
                });
    }

    private List<Double> averageDeckPicks(List<IowaGamblingResult> rows) {
        List<Double> avg = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            final int idx = i;
            double v = ServiceSupport.round(
                    rows.stream()
                            .map(r -> parseJsonArray(r.deckPicks(), 4))
                            .filter(l -> l.size() > idx)
                            .mapToInt(l -> l.get(idx))
                            .average().orElse(0), 1);
            avg.add(v);
        }
        return avg;
    }

    private List<Double> averageBlockScores(List<IowaGamblingResult> rows) {
        int maxLen = rows.stream()
                .mapToInt(r -> parseJsonArray(r.blockScores(), 0).size())
                .max().orElse(0);
        List<Double> avg = new ArrayList<>();
        for (int i = 0; i < maxLen; i++) {
            final int idx = i;
            double v = ServiceSupport.round(
                    rows.stream()
                            .map(r -> parseJsonArray(r.blockScores(), 0))
                            .filter(l -> l.size() > idx)
                            .mapToInt(l -> l.get(idx))
                            .average().orElse(0), 1);
            avg.add(v);
        }
        return avg;
    }

    /**
     * 解析 JSON 数字数组字符串；失败时返回指定长度的默认零数组。
     */
    static List<Integer> parseJsonArray(String json, int defaultLen) {
        try {
            List<Integer> list = new ArrayList<>();
            var node = MAPPER.readTree(json);
            if (node != null && node.isArray()) {
                node.forEach(n -> list.add(n.asInt()));
            }
            return list;
        } catch (Exception e) {
            log.warn("iowa-gambling parse json array failed: {}", e.getMessage());
            List<Integer> fallback = new ArrayList<>();
            for (int i = 0; i < defaultLen; i++) {
                fallback.add(0);
            }
            return fallback;
        }
    }

    /**
     * 查询净分数排行榜（按用户名去重，每人取最高净分数）。
     * <p>
     * 数据量小，直接全量加载后在内存中去重排序，保证逻辑简单可靠。
     *
     * @param limit 返回条数（1~50，超出自动收敛）
     * @return 排行榜响应，含榜单与上榜总人数
     */
    public Mono<IowaGamblingLeaderboardResponse> leaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 50);
        return ServiceSupport.selectAll(template, IowaGamblingLeaderboardRecord.class)
                .map(rows -> buildLeaderboardResponse(rows, safeLimit));
    }

    /**
     * 生成一次性 PoW challenge，供前端计算排行榜提交工作量证明。
     *
     * @return challenge 信息（challengeId、过期时间、难度）
     */
    public Mono<IowaGamblingLeaderboardChallengeResponse> createLeaderboardChallenge() {
        long expiresAt = System.currentTimeMillis() + CHALLENGE_WINDOW_MS;
        String challengeId = UUID.randomUUID().toString();
        challengeCache.put(challengeId, new ChallengeState(expiresAt));
        return Mono.just(new IowaGamblingLeaderboardChallengeResponse(challengeId, expiresAt, POW_DIFFICULTY));
    }

    /**
     * 提交排行榜成绩（防刷榜）。
     * <p>
     * 校验链：用户名冷却 → Turnstile 人机验证 → PoW（一次性 challenge + 难度 + 防重放）→ 落库。
     * 同一用户名多次提交仅保留净分数最高的一条（按用户名去重逻辑体现在 leaderboard()）。
     *
     * @return 当前用户名最佳成绩在榜单中的名次与上榜总人数
     */
    public Mono<IowaGamblingLeaderboardSubmitResponse> submitLeaderboard(
            String username, int netScore, int finalMoney, boolean bankrupt, int totalRounds,
            String deckPicks, String challengeId, String powHash, String powNonce,
            String turnstileToken, String remoteIp) {

        // 同一用户名 10 秒冷却，防止短时间内反复提交
        long now = System.currentTimeMillis();
        Long lastAt = lastSubmitAt.getIfPresent(username);
        if (lastAt != null && now - lastAt < SUBMIT_COOLDOWN_MS) {
            long waitMs = SUBMIT_COOLDOWN_MS - (now - lastAt);
            return Mono.error(new IllegalArgumentException(
                    "submit too frequent, please retry after " + Math.max(1, waitMs / 1000) + "s"));
        }

        // 结果字段合法性：净分数范围 -100~100，手数 1~100，资金范围宽松
        if (netScore < -100 || netScore > 100) {
            return Mono.error(new IllegalArgumentException("invalid netScore"));
        }
        if (totalRounds < 1 || totalRounds > 100) {
            return Mono.error(new IllegalArgumentException("invalid totalRounds"));
        }
        if (finalMoney < -1000000 || finalMoney > 1000000) {
            return Mono.error(new IllegalArgumentException("invalid finalMoney"));
        }
        if (deckPicks == null || deckPicks.length() > 64) {
            return Mono.error(new IllegalArgumentException("invalid deckPicks"));
        }

        IowaGamblingLeaderboardRecord entity = new IowaGamblingLeaderboardRecord(
                null, username, netScore, finalMoney, bankrupt, totalRounds,
                deckPicks, powHash, powNonce, now);

        // Turnstile 验证必须先于消费 challenge/PoW，否则验证失败会白白消耗并让用户白等冷却
        return turnstileVerifier.verify(turnstileToken, remoteIp)
                .then(Mono.fromRunnable(() -> {
                    String validationError = consumeAndValidateChallenge(
                            challengeId, username, netScore, finalMoney, totalRounds,
                            deckPicks, powHash, powNonce);
                    if (validationError != null) {
                        throw new IllegalArgumentException(validationError);
                    }
                    usedPowHashes.put(powHash, Boolean.TRUE);
                    lastSubmitAt.put(username, now);
                }))
                // 惰性构建 insert 链：验证失败时不应触碰数据库
                .then(Mono.defer(() -> template.insert(IowaGamblingLeaderboardRecord.class)
                        .using(entity)
                        .then(ServiceSupport.selectAll(template, IowaGamblingLeaderboardRecord.class))
                        .map(rows -> computeRanks(rows, username))));
    }

    // ── PoW 验证 ──────────────────────────────────────────────────────

    /**
     * 消费并验证 challenge + PoW。
     *
     * @return null 表示通过，否则返回错误信息
     */
    String consumeAndValidateChallenge(String challengeId, String username, int netScore,
                                       int finalMoney, int totalRounds, String deckPicks,
                                       String powHash, String powNonce) {
        if (challengeId == null || challengeId.isBlank()) {
            return "challengeId is required";
        }
        if (powHash == null || powHash.isBlank() || powNonce == null || powNonce.isBlank()) {
            return "powHash and powNonce are required";
        }
        if (usedPowHashes.getIfPresent(powHash) != null) {
            return "PoW already used";
        }
        ChallengeState challengeState = challengeCache.asMap().remove(challengeId);
        long now = System.currentTimeMillis();
        if (challengeState == null || challengeState.expiresAt() < now) {
            return "Challenge expired or already used";
        }
        String payload = buildChallengePowPayload(
                challengeId, username, netScore, finalMoney, totalRounds, deckPicks);
        String expectedHash = sha256(payload + powNonce);
        if (!expectedHash.equals(powHash)) {
            return "PoW hash mismatch";
        }
        if (!meetsPoWDifficulty(powHash)) {
            return "PoW difficulty not met";
        }
        return null;
    }

    /** 构建 PoW payload 字符串（与前端一致）。 */
    static String buildChallengePowPayload(String challengeId, String username, int netScore,
                                           int finalMoney, int totalRounds, String deckPicks) {
        return challengeId + "|" + username + "|" + netScore + "|" + finalMoney
                + "|" + totalRounds + "|" + deckPicks;
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

    // ── 私有辅助方法 ──────────────────────────────────────────────────

    /** 计算当前用户名最佳成绩在榜单中的名次。 */
    private IowaGamblingLeaderboardSubmitResponse computeRanks(
            List<IowaGamblingLeaderboardRecord> rows, String username) {
        Map<String, Integer> bestByUser = new HashMap<>();
        for (IowaGamblingLeaderboardRecord r : rows) {
            bestByUser.merge(r.username(), r.netScore(), Math::max);
        }
        int myBest = bestByUser.getOrDefault(username, Integer.MIN_VALUE);
        long rank = bestByUser.values().stream().filter(v -> v > myBest).count() + 1;
        return new IowaGamblingLeaderboardSubmitResponse((int) rank, bestByUser.size());
    }

    /** 构建排行榜响应（按用户名去重，各取最高净分数那条记录）。 */
    private IowaGamblingLeaderboardResponse buildLeaderboardResponse(
            List<IowaGamblingLeaderboardRecord> rows, int limit) {
        Map<String, IowaGamblingLeaderboardRecord> bestByUser = new HashMap<>();
        for (IowaGamblingLeaderboardRecord r : rows) {
            bestByUser.merge(r.username(), r,
                    (a, b) -> a.netScore() >= b.netScore() ? a : b);
        }
        List<IowaGamblingLeaderboardRecord> sorted = ServiceSupport.sorted(
                new ArrayList<>(bestByUser.values()),
                Comparator.comparingInt(IowaGamblingLeaderboardRecord::netScore).reversed()
                        .thenComparingLong(IowaGamblingLeaderboardRecord::createdAt));

        List<IowaGamblingLeaderboardEntry> leaders = new ArrayList<>();
        int rank = 1;
        for (IowaGamblingLeaderboardRecord e : sorted.stream().limit(limit).toList()) {
            leaders.add(new IowaGamblingLeaderboardEntry(
                    rank++, e.username(), e.netScore(), e.finalMoney(),
                    e.bankrupt(), e.totalRounds(), e.createdAt()));
        }
        return new IowaGamblingLeaderboardResponse(leaders, bestByUser.size());
    }

    record ChallengeState(long expiresAt) {
    }
}
