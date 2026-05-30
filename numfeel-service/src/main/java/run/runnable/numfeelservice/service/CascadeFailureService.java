package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureTopologyStats;
import run.runnable.numfeelservice.model.GameplayEntities.CascadeFailureResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
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
        return ServiceSupport.selectAll(template, CascadeFailureResult.class)
                .map(rows -> toLeaderboardResponse(rows, safeLimit));
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

    /** 按得分与存活率排序生成排行榜。 */
    private CascadeFailureLeaderboardResponse toLeaderboardResponse(List<CascadeFailureResult> rows, int limit) {
        List<CascadeFailureResult> sortedRows = ServiceSupport.sorted(
                rows,
                java.util.Comparator.comparingInt(CascadeFailureResult::score).reversed()
                        .thenComparing(java.util.Comparator.comparingDouble(CascadeFailureResult::survivalRate).reversed())
        );
        List<CascadeFailureLeaderboardEntry> leaders = new ArrayList<>();
        int rank = 1;
        for (CascadeFailureResult row : sortedRows.stream().limit(limit).toList()) {
            leaders.add(new CascadeFailureLeaderboardEntry(
                    row.topology(),
                    row.strategy(),
                    row.survivalRate(),
                    row.cascadeSteps(),
                    row.score(),
                    row.createdAt(),
                    rank++
            ));
        }
        return new CascadeFailureLeaderboardResponse(leaders, rows.size());
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }

    private double round3(double value) {
        return ServiceSupport.round(value, 3);
    }
}
