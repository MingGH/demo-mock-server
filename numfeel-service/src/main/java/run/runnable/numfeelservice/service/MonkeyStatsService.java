package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeyLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeyStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeySubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.MonkeyStat;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;

/**
 * 无限猴子打字机 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class MonkeyStatsService {

    private final R2dbcEntityTemplate template;

    public MonkeyStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次无限猴子打字机实验结果，并返回最新的全局统计反馈。
     *
     * @param targetText   目标文本
     * @param targetLength 目标文本长度
     * @param totalAttempts 总尝试次数
     * @param totalChars   总生成字符数
     * @param success      是否成功生成目标文本
     * @param timeElapsed  耗时（秒）
     * @return 包含总运行次数、成功率和最长成功文本的提交响应
     */
    public Mono<MonkeySubmitResponse> submit(String targetText, int targetLength, long totalAttempts,
                                            long totalChars, boolean success, int timeElapsed) {
        MonkeyStat entity = new MonkeyStat(
                null, targetText, targetLength, totalAttempts, totalChars, success, timeElapsed, System.currentTimeMillis());
        return template.insert(MonkeyStat.class).using(entity).then(submitStats());
    }

    private Mono<MonkeySubmitResponse> submitStats() {
        return ServiceSupport.selectAll(template, MonkeyStat.class)
                .map(rows -> {
                    long totalRuns = rows.size();
                    long totalSuccesses = rows.stream().filter(MonkeyStat::success).count();
                    double successRate = totalRuns == 0 ? 0.0 : round3((double) totalSuccesses / totalRuns);
                    List<MonkeyStat> successRows = ServiceSupport.sorted(
                            rows.stream().filter(MonkeyStat::success).toList(),
                            Comparator.comparingInt(MonkeyStat::targetLength).reversed()
                                    .thenComparingLong(MonkeyStat::totalAttempts)
                    );
                    String longestTarget = successRows.isEmpty() ? null : successRows.get(0).targetText();
                    return new MonkeySubmitResponse(totalRuns, totalSuccesses, successRate, longestTarget);
                });
    }

    /**
     * 查询无限猴子打字机全局统计数据，包括成功率、最长成功文本和成功样本排行榜。
     *
     * @return 包含全局指标与排行榜的统计响应
     */
    public Mono<MonkeyStatsResponse> stats() {
        return ServiceSupport.selectAll(template, MonkeyStat.class)
                .map(this::toStatsResponse);
    }

    /** 聚合成功率、最长成功文本和成功样本排行榜。 */
    private MonkeyStatsResponse toStatsResponse(List<MonkeyStat> rows) {
        long totalRuns = rows.size();
        long totalSuccesses = rows.stream().filter(MonkeyStat::success).count();
        double successRate = totalRuns == 0 ? 0.0 : round3((double) totalSuccesses / totalRuns);
        List<MonkeyStat> successRows = ServiceSupport.sorted(
                rows.stream().filter(MonkeyStat::success).toList(),
                Comparator.comparingInt(MonkeyStat::targetLength).reversed()
                        .thenComparingLong(MonkeyStat::totalAttempts)
        );
        return new MonkeyStatsResponse(
                totalRuns,
                totalSuccesses,
                successRate,
                successRows.isEmpty() ? null : successRows.get(0).targetText(),
                toLeaderboard(successRows)
        );
    }

    /** 从成功样本中选取前 10 条，供前端展示示例排行榜。 */
    private List<MonkeyLeaderboardEntry> toLeaderboard(List<MonkeyStat> successRows) {
        List<MonkeyLeaderboardEntry> leaderboard = new ArrayList<>();
        for (MonkeyStat row : successRows.stream().limit(10).toList()) {
            leaderboard.add(new MonkeyLeaderboardEntry(
                    row.targetText(),
                    row.targetLength(),
                    row.totalAttempts(),
                    row.success()
            ));
        }
        return leaderboard;
    }

    private double round3(double value) {
        return ServiceSupport.round(value, 3);
    }
}
