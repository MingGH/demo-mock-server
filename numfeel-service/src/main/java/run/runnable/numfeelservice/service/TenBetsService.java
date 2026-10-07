package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsChallengeResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsItem;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsModeStat;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.TenBetsLeaderboardEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.scheduling.annotation.Scheduled;
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
import java.util.Set;
import java.util.UUID;

/**
 * 十连注 — 策略排行榜业务逻辑。
 * <p>
 * 与 {@link WealthButtonService} 的关键差异：本游戏的全部随机性集中在"中签位"，
 * 若由客户端自报，作弊者必然把中签位报在最大注上。因此：
 * <ol>
 *   <li>challenge 创建时由服务器随机生成中签位并保密（不下发给前端）；</li>
 *   <li>用户上传的是押注策略（每注金额序列）；</li>
 *   <li>提交时服务器用保密的中签位重放该策略，重算结算——上榜比的是策略本身，
 *       运气由服务器统一抽签，无法挑拣。</li>
 * </ol>
 */
@Service
public class TenBetsService {

    private static final Logger log = LoggerFactory.getLogger(TenBetsService.class);

    /** 开局本金。 */
    static final double START_CAPITAL = 100D;

    /** 赔率：中签收 10 倍。 */
    static final double PAYOUT = 10D;

    /** 总下注机会数。 */
    static final int ROUND_COUNT = 10;

    /** PoW 难度：哈希前缀需要的十六进制 '0' 数量。 */
    static final int POW_DIFFICULTY = 4;

    /** challenge 有效窗口：5 分钟。 */
    static final long CHALLENGE_WINDOW_MS = 5 * 60 * 1000L;

    /** 同一用户名提交冷却时间：10 秒。 */
    static final long SUBMIT_COOLDOWN_MS = 10_000L;

    /** 合法流派标识。 */
    private static final Set<String> VALID_MODES =
            Set.of("manual", "allin", "uniform", "probe", "equalize");

    private final Cache<String, Boolean> usedPowHashes = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(CHALLENGE_WINDOW_MS))
            .maximumSize(10000)
            .build();

    /** challenge 缓存：中签位在这里保密保管。 */
    private final Cache<String, ChallengeState> challengeCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(CHALLENGE_WINDOW_MS))
            .maximumSize(10000)
            .build();

    private final Cache<String, Long> lastSubmitAt = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMillis(SUBMIT_COOLDOWN_MS * 2))
            .maximumSize(10000)
            .build();

    private final R2dbcEntityTemplate template;
    private final TurnstileVerifier turnstileVerifier;

    public TenBetsService(R2dbcEntityTemplate template, TurnstileVerifier turnstileVerifier) {
        this.template = template;
        this.turnstileVerifier = turnstileVerifier;
    }

    // ── challenge ─────────────────────────────────────────────────────

    /** 生成一次性 challenge：中签位服务器保密，不下发。 */
    public Mono<TenBetsChallengeResponse> createChallenge() {
        long expiresAt = System.currentTimeMillis() + CHALLENGE_WINDOW_MS;
        String challengeId = UUID.randomUUID().toString();
        int winnerPos = 1 + java.util.concurrent.ThreadLocalRandom.current().nextInt(ROUND_COUNT);
        challengeCache.put(challengeId, new ChallengeState(winnerPos, expiresAt));
        return Mono.just(new TenBetsChallengeResponse(challengeId, expiresAt, POW_DIFFICULTY));
    }

    // ── 提交 ──────────────────────────────────────────────────────────

    public Mono<TenBetsSubmitResponse> submit(
            String username, String mode, String bets,
            String challengeId, String powHash, String powNonce,
            String turnstileToken, String remoteIp) {

        long now = System.currentTimeMillis();
        Long lastAt = lastSubmitAt.getIfPresent(username);
        if (lastAt != null && now - lastAt < SUBMIT_COOLDOWN_MS) {
            long waitMs = SUBMIT_COOLDOWN_MS - (now - lastAt);
            return Mono.error(new IllegalArgumentException(
                    "submit too frequent, please retry after " + Math.max(1, waitMs / 1000) + "s"));
        }

        double[] parsedBets;
        try {
            parsedBets = parseBets(bets);
        } catch (IllegalArgumentException e) {
            return Mono.error(e);
        }

        // Turnstile 必须在消费 challenge/PoW 之前校验，失败不消耗挑战
        return turnstileVerifier.verify(turnstileToken, remoteIp)
                .then(Mono.fromCallable(() -> {
                    int winnerPos = consumeChallenge(challengeId, username, mode, bets, powHash, powNonce);
                    GameResult result = replay(parsedBets, winnerPos);
                    markPowUsed(powHash);
                    lastSubmitAt.put(username, now);
                    return new Object[]{ winnerPos, result };
                }))
                .flatMap(pair -> {
                    int winnerPos = (int) pair[0];
                    GameResult result = (GameResult) pair[1];
                    TenBetsLeaderboardEntry entity = new TenBetsLeaderboardEntry(
                            null, username, mode, result.finalCapital(), result.rounds(),
                            result.won(), winnerPos, bets, powHash, powNonce, System.currentTimeMillis());
                    return template.insert(TenBetsLeaderboardEntry.class)
                            .using(entity)
                            .then(ServiceSupport.selectAll(template, TenBetsLeaderboardEntry.class))
                            .map(rows -> {
                                int rank = computeRank(rows, username, result.finalCapital());
                                long total = distinctPlayers(rows);
                                return new TenBetsSubmitResponse(
                                        rank, total, winnerPos, result.finalCapital(),
                                        result.rounds(), result.won());
                            });
                });
    }

    // ── 查询 ──────────────────────────────────────────────────────────

    public Mono<TenBetsLeaderboardResponse> getLeaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 100);
        return ServiceSupport.selectAll(template, TenBetsLeaderboardEntry.class)
                .map(rows -> buildResponse(rows, safeLimit));
    }

    // ── 重放（纯静态，便于测试；规则必须与前端 ten-bets-logic.js 一致） ──

    /**
     * 用给定中签位重放押注策略。
     * 每注押 min(计划注额, 当前资金)；中签即停（剩余机会必输）；资金归零即止。
     */
    static GameResult replay(double[] bets, int winnerPos) {
        if (winnerPos < 1 || winnerPos > ROUND_COUNT) {
            throw new IllegalArgumentException("invalid winnerPos");
        }
        double capital = START_CAPITAL;
        int rounds = 0;
        boolean won = false;
        for (int round = 1; round <= ROUND_COUNT; round++) {
            double bet = Math.min(bets[round - 1], capital);
            if (!(bet > 0)) break; // 无钱可押（资金归零时已被 bust 分支覆盖，防御）
            rounds = round;
            capital -= bet;
            if (round == winnerPos) {
                capital += bet * PAYOUT;
                won = true;
                break;
            }
            if (capital <= 1e-9) {
                capital = 0D;
                break;
            }
        }
        return new GameResult(rounds, won, capital);
    }

    /** 解析逗号分隔的押注策略：1~10 个正数。 */
    static double[] parseBets(String bets) {
        if (bets == null || bets.isBlank()) {
            throw new IllegalArgumentException("bets is required");
        }
        String[] parts = bets.split(",");
        if (parts.length < 1 || parts.length > ROUND_COUNT) {
            throw new IllegalArgumentException("bets must contain 1 to " + ROUND_COUNT + " numbers");
        }
        double[] parsed = new double[ROUND_COUNT];
        for (int i = 0; i < parts.length; i++) {
            double v;
            try {
                v = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("bets contains invalid number: " + parts[i]);
            }
            if (!Double.isFinite(v) || v <= 0 || v > 1e9) {
                throw new IllegalArgumentException("bets contains invalid number: " + parts[i]);
            }
            parsed[i] = v;
        }
        return parsed;
    }

    /** 构建 PoW payload（与前端一致）。 */
    static String buildChallengePowPayload(String challengeId, String username, String mode, String bets) {
        return challengeId + "|" + username + "|" + mode + "|" + bets;
    }

    static boolean meetsPoWDifficulty(String hash) {
        if (hash == null || hash.length() < POW_DIFFICULTY) return false;
        for (int i = 0; i < POW_DIFFICULTY; i++) {
            if (hash.charAt(i) != '0') return false;
        }
        return true;
    }

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

    /**
     * 消费并验证 challenge + PoW，返回保密的中签位。
     *
     * @throws IllegalArgumentException 校验失败时
     */
    int consumeChallenge(String challengeId, String username, String mode, String bets,
                         String powHash, String powNonce) {
        if (challengeId == null || challengeId.isBlank()) {
            throw new IllegalArgumentException("challengeId is required");
        }
        if (powHash == null || powHash.isBlank()) {
            throw new IllegalArgumentException("powHash is required");
        }
        if (powNonce == null || powNonce.isBlank()) {
            throw new IllegalArgumentException("powNonce is required");
        }
        if (usedPowHashes.getIfPresent(powHash) != null) {
            throw new IllegalArgumentException("PoW already used");
        }
        ChallengeState state = challengeCache.asMap().remove(challengeId);
        long now = System.currentTimeMillis();
        if (state == null || state.expiresAt() < now) {
            throw new IllegalArgumentException("Challenge expired or already used");
        }
        String payload = buildChallengePowPayload(challengeId, username, mode, bets);
        if (!sha256(payload + powNonce).equals(powHash)) {
            throw new IllegalArgumentException("PoW hash mismatch");
        }
        if (!meetsPoWDifficulty(powHash)) {
            throw new IllegalArgumentException("PoW difficulty not met");
        }
        usedPowHashes.put(powHash, Boolean.TRUE); // 防重放：校验通过即标记
        return state.winnerPos();
    }

    private void markPowUsed(String powHash) {
        usedPowHashes.put(powHash, Boolean.TRUE);
    }

    // ── 榜单构建 ──────────────────────────────────────────────────────

    private TenBetsLeaderboardResponse buildResponse(List<TenBetsLeaderboardEntry> rows, int limit) {
        // 每用户取最高结算
        Map<String, TenBetsLeaderboardEntry> best = new HashMap<>();
        for (TenBetsLeaderboardEntry r : rows) {
            best.merge(r.username(), r, (a, b) -> a.finalCapital() >= b.finalCapital() ? a : b);
        }
        List<TenBetsLeaderboardEntry> sorted = ServiceSupport.sorted(
                new ArrayList<>(best.values()),
                Comparator.comparingDouble(TenBetsLeaderboardEntry::finalCapital).reversed()
                        .thenComparingLong(TenBetsLeaderboardEntry::createdAt));

        List<TenBetsItem> top = new ArrayList<>();
        int rank = 1;
        for (TenBetsLeaderboardEntry e : sorted.stream().limit(limit).toList()) {
            top.add(new TenBetsItem(rank++, e.username(), e.mode(), e.finalCapital(),
                    e.rounds(), e.won(), e.winnerPos(), e.createdAt()));
        }

        // 策略聚合：什么策略在服务器抽签下表现最佳
        Map<String, List<TenBetsLeaderboardEntry>> byMode = new HashMap<>();
        for (TenBetsLeaderboardEntry r : rows) {
            byMode.computeIfAbsent(r.mode(), k -> new ArrayList<>()).add(r);
        }
        List<TenBetsModeStat> modeStats = new ArrayList<>();
        for (Map.Entry<String, List<TenBetsLeaderboardEntry>> entry : byMode.entrySet()) {
            List<TenBetsLeaderboardEntry> list = entry.getValue();
            long wins = 0;
            double sum = 0, bestCap = 0, sumRounds = 0;
            for (TenBetsLeaderboardEntry r : list) {
                if (r.won()) wins++;
                sum += r.finalCapital();
                if (r.finalCapital() > bestCap) bestCap = r.finalCapital();
                sumRounds += r.rounds();
            }
            modeStats.add(new TenBetsModeStat(
                    entry.getKey(), list.size(), wins, list.size() - wins,
                    sum / list.size(), bestCap, sumRounds / list.size()));
        }
        modeStats.sort(Comparator.comparingDouble(TenBetsModeStat::avgCapital).reversed());

        return new TenBetsLeaderboardResponse(
                top, modeStats, (long) rows.size(), (long) best.size());
    }

    private int computeRank(List<TenBetsLeaderboardEntry> rows, String username, double finalCapital) {
        Map<String, Double> best = new HashMap<>();
        for (TenBetsLeaderboardEntry r : rows) {
            best.merge(r.username(), r.finalCapital(), Math::max);
        }
        double myBest = best.getOrDefault(username, finalCapital);
        long higher = best.values().stream().filter(v -> v > myBest).count();
        return (int) (higher + 1);
    }

    private long distinctPlayers(List<TenBetsLeaderboardEntry> rows) {
        Set<String> users = new java.util.HashSet<>();
        for (TenBetsLeaderboardEntry r : rows) users.add(r.username());
        return users.size();
    }

    // ── 定时清理：与 wealth-button 相同思路，当前无作弊形态需删除，保留挂载点 ──

    @Scheduled(initialDelay = 120_000L, fixedDelay = 300_000L)
    public void scheduledHousekeeping() {
        // 十连注的重放完全由服务器决定结果，无客户端可伪造字段需要后台清理；
        // 保留周期任务挂载点，后续若增加排行榜清理逻辑写在这里。
    }

    record ChallengeState(int winnerPos, long expiresAt) {
    }

    record GameResult(int rounds, boolean won, double finalCapital) {
    }
}
