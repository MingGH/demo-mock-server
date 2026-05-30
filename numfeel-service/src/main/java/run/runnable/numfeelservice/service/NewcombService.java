package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.NewcombStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.NewcombResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Set;

/**
 * 纽科姆悖论 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class NewcombService {

    private static final Set<String> VALID_CHOICES = Set.of("one", "two");

    private final R2dbcEntityTemplate template;

    public NewcombService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public boolean isValidChoice(String choice) {
        return choice != null && VALID_CHOICES.contains(choice);
    }

    /** 保存一次单盒/双盒选择结果，并返回最新统计。 */
    public Mono<NewcombStatsResponse> submit(String choice, String prediction, boolean hit, int payoff) {
        NewcombResult entity = new NewcombResult(null, choice, prediction, hit, payoff, System.currentTimeMillis());
        return template.insert(NewcombResult.class).using(entity).then(queryStats());
    }

    /** 查询 Newcomb 悖论整体样本统计。 */
    public Mono<NewcombStatsResponse> stats() {
        return queryStats();
    }

    /** 统一查询路径，避免 submit 和 stats 各自复制统计逻辑。 */
    private Mono<NewcombStatsResponse> queryStats() {
        return ServiceSupport.selectAll(template, NewcombResult.class)
                .map(this::toStatsResponse);
    }

    /** 聚合单盒/双盒选择分布、命中率和平均收益。 */
    private NewcombStatsResponse toStatsResponse(List<NewcombResult> rows) {
        long total = rows.size();
        long oneBox = rows.stream().filter(row -> "one".equals(row.choice())).count();
        long twoBox = rows.stream().filter(row -> "two".equals(row.choice())).count();
        long hits = rows.stream().filter(NewcombResult::hit).count();

        return new NewcombStatsResponse(
                total,
                oneBox,
                twoBox,
                hits,
                total > 0 ? ServiceSupport.percentage(hits, total, 1) : 0,
                total > 0 ? ServiceSupport.percentage(oneBox, total, 1) : 0,
                total > 0 ? ServiceSupport.percentage(twoBox, total, 1) : 0,
                roundAvg(rows, "one"),
                roundAvg(rows, "two")
        );
    }

    /** 计算某一选择下的平均收益，并四舍五入为整数。 */
    private long roundAvg(List<NewcombResult> rows, String choice) {
        return Math.round(rows.stream()
                .filter(row -> choice.equals(row.choice()))
                .mapToInt(NewcombResult::payoff)
                .average()
                .orElse(0));
    }
}
