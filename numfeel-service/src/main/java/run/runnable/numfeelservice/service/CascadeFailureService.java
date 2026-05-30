package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureTopologyStats;
import run.runnable.numfeelservice.model.GameplayEntities.CascadeFailureResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 级联故障模拟器 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class CascadeFailureService {

    private final R2dbcEntityTemplate template;

    public CascadeFailureService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<CascadeFailureSubmitResponse> submit(String topology, int coupling, int capacity, String strategy,
                                                     String triggerPos, double survivalRate, int cascadeSteps,
                                                     int maxComponent, int totalNodes, int score) {
        CascadeFailureResult entity = new CascadeFailureResult(
                null, topology, coupling, capacity, strategy, triggerPos, survivalRate,
                cascadeSteps, maxComponent, totalNodes, score, System.currentTimeMillis());
        return template.insert(CascadeFailureResult.class)
                .using(entity)
                .then(template.select(CascadeFailureResult.class).all().count())
                .map(total -> new CascadeFailureSubmitResponse(total, score));
    }

    public Mono<CascadeFailureStatsResponse> stats() {
        return ServiceSupport.selectAll(template, CascadeFailureResult.class)
                .map(this::toStatsResponse);
    }

    public Mono<CascadeFailureLeaderboardResponse> leaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 100);
        DatabaseClient client = template.getDatabaseClient();
        Mono<List<CascadeFailureLeaderboardEntry>> leadersMono = client.sql("""
                        SELECT topology, strategy, survival_rate, cascade_steps, score, created_at
                        FROM cascade_failure_results
                        ORDER BY score DESC, survival_rate DESC
                        LIMIT ?
                        """)
                .bind(0, safeLimit)
                .map((row, metadata) -> new CascadeFailureLeaderboardEntry(
                        row.get("topology", String.class),
                        row.get("strategy", String.class),
                        number(row.get("survival_rate")).doubleValue(),
                        number(row.get("cascade_steps")).intValue(),
                        number(row.get("score")).intValue(),
                        number(row.get("created_at")).longValue(),
                        0
                ))
                .all()
                .collectList()
                .map(rows -> {
                    List<CascadeFailureLeaderboardEntry> ranked = new ArrayList<>();
                    int rank = 1;
                    for (CascadeFailureLeaderboardEntry row : rows) {
                        ranked.add(new CascadeFailureLeaderboardEntry(
                                row.topology(),
                                row.strategy(),
                                row.survivalRate(),
                                row.cascadeSteps(),
                                row.score(),
                                row.time(),
                                rank++
                        ));
                    }
                    return ranked;
                });
        Mono<Integer> totalMono = client.sql("SELECT COUNT(*) AS total FROM cascade_failure_results")
                .map((row, metadata) -> number(row.get("total")).intValue())
                .one()
                .defaultIfEmpty(0);
        return Mono.zip(leadersMono, totalMono)
                .map(tuple -> new CascadeFailureLeaderboardResponse(tuple.getT1(), tuple.getT2()));
    }

    /** 聚合全局指标与拓扑维度统计。 */
    private CascadeFailureStatsResponse toStatsResponse(List<CascadeFailureResult> rows) {
        long totalRuns = rows.size();
        return new CascadeFailureStatsResponse(buildGlobalStats(rows, totalRuns), buildTopologyStats(rows));
    }

    /** 计算平均存活率、平均级联步数和高存活率占比。 */
    private CascadeFailureGlobalStats buildGlobalStats(List<CascadeFailureResult> rows, long totalRuns) {
        if (totalRuns == 0) {
            return new CascadeFailureGlobalStats(0, 0.0, 0.0, 0.0, 0.0);
        }

        return new CascadeFailureGlobalStats(
                totalRuns,
                round3(rows.stream().mapToDouble(CascadeFailureResult::survivalRate).average().orElse(0)),
                round1(rows.stream().mapToInt(CascadeFailureResult::cascadeSteps).average().orElse(0)),
                round1(rows.stream().mapToInt(CascadeFailureResult::score).average().orElse(0)),
                round3(rows.stream().filter(row -> row.survivalRate() >= 0.8).count() / (double) totalRuns)
        );
    }

    /** 按拓扑类型汇总样本数和平均存活率。 */
    private List<CascadeFailureTopologyStats> buildTopologyStats(List<CascadeFailureResult> rows) {
        List<CascadeFailureTopologyStats> byTopology = new ArrayList<>();
        rows.stream()
                .collect(java.util.stream.Collectors.groupingBy(CascadeFailureResult::topology))
                .entrySet()
                .stream()
                .sorted((a, b) -> Integer.compare(b.getValue().size(), a.getValue().size()))
                .forEach(entry -> byTopology.add(new CascadeFailureTopologyStats(
                        entry.getKey(),
                        entry.getValue().size(),
                        round3(entry.getValue().stream().mapToDouble(CascadeFailureResult::survivalRate).average().orElse(0))
                )));
        return byTopology;
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }

    private double round3(double value) {
        return ServiceSupport.round(value, 3);
    }

    private Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
