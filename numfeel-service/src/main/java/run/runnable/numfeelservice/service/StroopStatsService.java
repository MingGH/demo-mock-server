package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.StroopResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 斯特鲁普效应挑战 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class StroopStatsService {

    private final R2dbcEntityTemplate template;

    public StroopStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次斯特鲁普效应挑战结果，并返回当前 Stroop 效应的历史排名反馈。
     *
     * @param total        总题数
     * @param correctCount 正确数量
     * @param accuracy     正确率
     * @param avgRT        平均反应时（毫秒）
     * @param conAvgRT     一致条件平均反应时（毫秒）
     * @param incAvgRT     不一致条件平均反应时（毫秒）
     * @param stroopEffect Stroop 效应值（毫秒）
     * @param grade        评级
     * @return 包含排名、总样本数和百分位的提交响应
     */
    public Mono<StroopSubmitResponse> submit(int total, int correctCount, double accuracy,
                                              double avgRT, double conAvgRT, double incAvgRT,
                                              double stroopEffect, String grade) {
        StroopResult entity = new StroopResult(
                null, total, correctCount, accuracy, avgRT, conAvgRT, incAvgRT, stroopEffect, grade, System.currentTimeMillis());
        return template.insert(StroopResult.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, StroopResult.class))
                .map(rows -> toSubmitResponse(rows, stroopEffect));
    }

    /**
     * 查询斯特鲁普效应挑战全局统计数据，包括平均效应值、反应时、正确率和评级分布。
     *
     * @return 包含全局指标与评级分布的统计响应
     */
    public Mono<StroopStatsResponse> stats() {
        return ServiceSupport.selectAll(template, StroopResult.class)
                .map(this::toStatsResponse);
    }

    /** 依据 Stroop 效应值越小越好的规则生成提交后的排名反馈。 */
    private StroopSubmitResponse toSubmitResponse(java.util.List<StroopResult> rows, double stroopEffect) {
        long rank = rows.stream().filter(row -> row.stroopEffect() < stroopEffect).count() + 1;
        long totalSessions = rows.size();
        return new StroopSubmitResponse(
                rank,
                totalSessions,
                totalSessions > 0 ? Math.round((1.0 - (double) rank / totalSessions) * 100) : 0
        );
    }

    /** 聚合平均效应值、反应时、正确率和评级分布。 */
    private StroopStatsResponse toStatsResponse(java.util.List<StroopResult> rows) {
        StroopGlobalStats global = new StroopGlobalStats(
                rows.size(),
                round1(rows.stream().mapToDouble(StroopResult::stroopEffect).average().orElse(0)),
                round1(rows.stream().mapToDouble(StroopResult::avgRt).average().orElse(0)),
                round1(rows.stream().mapToDouble(StroopResult::accuracy).average().orElse(0) * 100),
                round1(rows.stream().mapToDouble(StroopResult::stroopEffect).min().orElse(0)),
                round1(rows.stream().mapToDouble(StroopResult::stroopEffect).max().orElse(0)),
                round1(rows.stream().mapToDouble(StroopResult::conAvgRt).average().orElse(0)),
                round1(rows.stream().mapToDouble(StroopResult::incAvgRt).average().orElse(0))
        );
        Map<String, Long> gradeDist = new LinkedHashMap<>(ServiceSupport.countBy(rows, StroopResult::grade));
        return new StroopStatsResponse(global, gradeDist);
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
