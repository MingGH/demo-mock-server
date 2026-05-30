package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillScenarioStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SecKillStat;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 秒杀抢票模拟器 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class SecKillStatsService {

    private final R2dbcEntityTemplate template;

    public SecKillStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<SecKillStatsResponse> submit(int participants, int stock, boolean userWon,
                                             int userRank, double userLatency, double latencyGap) {
        SecKillStat entity = new SecKillStat(
                null, participants, stock, userWon, userRank, userLatency, latencyGap, System.currentTimeMillis());
        return template.insert(SecKillStat.class).using(entity).then(stats());
    }

    /** 查询秒杀实验总胜率，并按参与人数与库存组合返回热门场景统计。 */
    public Mono<SecKillStatsResponse> stats() {
        return ServiceSupport.selectAll(template, SecKillStat.class)
                .map(this::toStatsResponse);
    }

    /** 聚合总场次、总胜场和场景维度统计。 */
    private SecKillStatsResponse toStatsResponse(List<SecKillStat> rows) {
        long totalRuns = rows.size();
        long totalWins = rows.stream().filter(SecKillStat::userWon).count();
        double winRate = totalRuns == 0 ? 0.0 : round3((double) totalWins / totalRuns);
        return new SecKillStatsResponse(totalRuns, totalWins, winRate, buildScenarioStats(rows));
    }

    /** 以 `participants:stock` 为键聚合场景，并只保留样本最多的前 10 个。 */
    private List<SecKillScenarioStats> buildScenarioStats(List<SecKillStat> rows) {
        java.util.Map<String, java.util.List<SecKillStat>> groups = rows.stream()
                .collect(java.util.stream.Collectors.groupingBy(row -> row.participants() + ":" + row.stock()));

        List<SecKillScenarioStats> byScenario = new ArrayList<>();
        groups.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .limit(10)
                .forEach(entry -> byScenario.add(toScenarioStats(entry.getValue())));
        return byScenario;
    }

    /** 将同一参与人数/库存场景的多条记录汇总为一条统计项。 */
    private SecKillScenarioStats toScenarioStats(List<SecKillStat> rows) {
        SecKillStat first = rows.get(0);
        long wins = rows.stream().filter(SecKillStat::userWon).count();
        return new SecKillScenarioStats(
                first.participants(),
                first.stock(),
                rows.size(),
                wins,
                rows.isEmpty() ? 0.0 : round3((double) wins / rows.size())
        );
    }

    private double round3(double value) {
        return ServiceSupport.round(value, 3);
    }
}
