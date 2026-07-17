package run.runnable.numfeelservice.service;

import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IqMatrixLeader;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IqMatrixSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IqMatrixTopResponse;
import run.runnable.numfeelservice.model.GameplayEntities.IqMatrixEntry;

import java.util.ArrayList;
import java.util.List;

/**
 * 矩阵推理与工作记忆挑战排行榜业务层。
 * <p>
 * 综合分始终由后端根据三个原始分项重算；查询使用数据库排序与计数，
 * 不把全表加载到 JVM。相同综合分使用竞赛排名（例如 1、1、3）。
 */
@Service
public class IqMatrixLeaderboardService {

    static final String TURNSTILE_ACTION = "iq-matrix-submit";
    static final String TURNSTILE_HOSTNAME = "numfeel.996.ninja";
    private static final int REACTION_FAST_MS = 1_000;
    private static final int REACTION_TIMEOUT_MS = 30_000;

    private final R2dbcEntityTemplate template;
    private final DatabaseClient db;
    private final TurnstileVerifier turnstileVerifier;

    public IqMatrixLeaderboardService(R2dbcEntityTemplate template,
                                      DatabaseClient db,
                                      TurnstileVerifier turnstileVerifier) {
        this.template = template;
        this.db = db;
        this.turnstileVerifier = turnstileVerifier;
    }

    /**
     * 验证人机挑战、重算综合分并保存成绩。
     *
     * @param name 已清洗的玩家昵称
     * @param matrixAccuracy 矩阵正确率（0-100）
     * @param avgReactionMs 答对题平均反应时间（毫秒）
     * @param wmAccuracy 工作记忆正确率（0-100）
     * @param token Turnstile token
     * @param remoteIp 客户端 IP
     * @return 保存后的权威分数、名次和总人数
     */
    public Mono<IqMatrixSubmitResponse> submit(String name,
                                               int matrixAccuracy,
                                               int avgReactionMs,
                                               int wmAccuracy,
                                               String token,
                                               String remoteIp) {
        int overallScore = computeOverallScore(matrixAccuracy, avgReactionMs, wmAccuracy);
        var entry = new IqMatrixEntry(
                null,
                name,
                matrixAccuracy,
                avgReactionMs,
                wmAccuracy,
                overallScore,
                System.currentTimeMillis()
        );
        return turnstileVerifier.verify(token, remoteIp, TURNSTILE_ACTION, TURNSTILE_HOSTNAME)
                .then(Mono.defer(() -> template.insert(IqMatrixEntry.class).using(entry)))
                .then(Mono.defer(() -> rankSnapshot(overallScore)))
                .map(snapshot -> new IqMatrixSubmitResponse(snapshot.rank(), snapshot.total(), overallScore));
    }

    /**
     * 查询排行榜前 N 名。
     *
     * @param limit 请求条数
     * @return 排行榜和总样本数
     */
    public Mono<IqMatrixTopResponse> top(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 50);
        Mono<List<LeaderboardRow>> rows = db.sql("""
                        SELECT name, matrix_accuracy, avg_reaction_ms, wm_accuracy, overall_score
                        FROM iq_matrix_leaderboard
                        ORDER BY overall_score DESC, matrix_accuracy DESC,
                                 wm_accuracy DESC, avg_reaction_ms ASC, created_at ASC, id ASC
                        LIMIT :limit
                        """)
                .bind("limit", safeLimit)
                .map((row, metadata) -> new LeaderboardRow(
                        row.get("name", String.class),
                        requiredInt(row.get("matrix_accuracy", Integer.class)),
                        requiredInt(row.get("avg_reaction_ms", Integer.class)),
                        requiredInt(row.get("wm_accuracy", Integer.class)),
                        requiredInt(row.get("overall_score", Integer.class))
                ))
                .all()
                .collectList();
        return Mono.zip(rows, countAll())
                .map(result -> new IqMatrixTopResponse(withCompetitionRanks(result.getT1()), result.getT2()));
    }

    /**
     * 按固定公开口径计算 0-100 综合分。
     * 矩阵正确率占 50%，工作记忆占 40%，速度占 10%；
     * 速度分乘以矩阵正确率，快速盲猜无法得到速度收益。
     *
     * @param matrixAccuracy 矩阵正确率（0-100）
     * @param avgReactionMs 答对题平均反应时间（毫秒）
     * @param wmAccuracy 工作记忆正确率（0-100）
     * @return 0-100 整数综合分
     */
    protected int computeOverallScore(int matrixAccuracy, int avgReactionMs, int wmAccuracy) {
        double matrix = clamp(matrixAccuracy, 0, 100);
        double workingMemory = clamp(wmAccuracy, 0, 100);
        double speed = clamp(
                (double) (REACTION_TIMEOUT_MS - avgReactionMs)
                        / (REACTION_TIMEOUT_MS - REACTION_FAST_MS) * 100.0,
                0,
                100
        );
        double effectiveSpeed = speed * matrix / 100.0;
        return (int) Math.round(matrix * 0.5 + workingMemory * 0.4 + effectiveSpeed * 0.1);
    }

    private Mono<RankSnapshot> rankSnapshot(int overallScore) {
        return db.sql("""
                        SELECT COALESCE(SUM(CASE WHEN overall_score > :score THEN 1 ELSE 0 END), 0) AS higher_count,
                               COUNT(*) AS total
                        FROM iq_matrix_leaderboard
                        """)
                .bind("score", overallScore)
                .map((row, metadata) -> new RankSnapshot(
                        requiredLong(row.get("higher_count", Long.class)) + 1,
                        requiredLong(row.get("total", Long.class))
                ))
                .one()
                .defaultIfEmpty(new RankSnapshot(1, 0));
    }

    private Mono<Long> countAll() {
        return db.sql("SELECT COUNT(*) AS total FROM iq_matrix_leaderboard")
                .map((row, metadata) -> requiredLong(row.get("total", Long.class)))
                .one()
                .defaultIfEmpty(0L);
    }

    private List<IqMatrixLeader> withCompetitionRanks(List<LeaderboardRow> rows) {
        List<IqMatrixLeader> leaders = new ArrayList<>(rows.size());
        Integer previousScore = null;
        int rank = 0;
        for (int index = 0; index < rows.size(); index++) {
            LeaderboardRow row = rows.get(index);
            if (previousScore == null || row.overallScore() != previousScore) {
                rank = index + 1;
                previousScore = row.overallScore();
            }
            leaders.add(new IqMatrixLeader(
                    rank,
                    row.name(),
                    row.matrixAccuracy(),
                    row.avgReactionMs(),
                    row.wmAccuracy(),
                    row.overallScore()
            ));
        }
        return leaders;
    }

    private static int requiredInt(Integer value) {
        if (value == null) throw new IllegalStateException("Leaderboard row contains null numeric value");
        return value;
    }

    private static long requiredLong(Long value) {
        if (value == null) throw new IllegalStateException("Leaderboard aggregate returned null");
        return value;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record RankSnapshot(long rank, long total) {
    }

    private record LeaderboardRow(
            String name,
            int matrixAccuracy,
            int avgReactionMs,
            int wmAccuracy,
            int overallScore
    ) {
    }
}
