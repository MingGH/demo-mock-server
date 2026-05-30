package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.CosmicReaperStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.CosmicReaperResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * 宇宙收割者假说 — 数据服务（R2DBC 重写）。
 */
@Service
public class CosmicReaperService {

    private final R2dbcEntityTemplate template;

    public CosmicReaperService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次宇宙收割者假说实验结果，保存后立即返回最新全局统计。
     *
     * @param strategy    玩家策略
     * @param escaped     是否成功逃脱
     * @param turns       回合数
     * @param score       得分
     * @param finalTech   最终科技值
     * @param finalSignal 最终信号值
     * @param finalStealth 最终隐身值
     * @return 更新后的全局统计响应
     */
    public Mono<CosmicReaperStatsResponse> submit(String strategy, boolean escaped, int turns, int score,
                                                   int finalTech, int finalSignal, int finalStealth) {
        CosmicReaperResult entity = new CosmicReaperResult(
                null, strategy, escaped, turns, score, finalTech, finalSignal, finalStealth, System.currentTimeMillis());
        return template.insert(CosmicReaperResult.class).using(entity).then(getStats());
    }

    /**
     * 查询宇宙收割者假说全局统计数据，包括逃脱率、平均得分、平均回合数和最常见策略。
     *
     * @return 包含全局指标的统计响应
     */
    public Mono<CosmicReaperStatsResponse> getStats() {
        return ServiceSupport.selectAll(template, CosmicReaperResult.class)
                .map(this::toStatsResponse);
    }

    /** 汇总逃脱率、平均得分、平均回合数以及最常见策略。 */
    private CosmicReaperStatsResponse toStatsResponse(java.util.List<CosmicReaperResult> rows) {
        long totalRuns = rows.size();
        if (totalRuns == 0) {
            return new CosmicReaperStatsResponse(totalRuns, 0.0, 0.0, 0.0, "-");
        }

        return new CosmicReaperStatsResponse(
                totalRuns,
                round1(rows.stream().filter(CosmicReaperResult::escaped).count() * 100.0 / totalRuns),
                round1(rows.stream().mapToInt(CosmicReaperResult::score).average().orElse(0)),
                round1(rows.stream().mapToInt(CosmicReaperResult::turns).average().orElse(0)),
                ServiceSupport.mostFrequentOrDefault(rows, CosmicReaperResult::strategy, "-")
        );
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
