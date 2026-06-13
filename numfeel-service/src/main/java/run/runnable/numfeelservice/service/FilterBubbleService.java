package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.FilterBubbleStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.FilterBubbleResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 信息茧房模拟器 — 业务逻辑层。
 */
@Service
public class FilterBubbleService {

    private final R2dbcEntityTemplate template;

    public FilterBubbleService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次信息茧房实验结果。
     */
    public Mono<Void> submit(double entropyDrop, String dominantCat, double dominantPct,
                             int convergeRound, int totalRounds, String clickSequence) {
        FilterBubbleResult entity = new FilterBubbleResult(
                null, entropyDrop, dominantCat, dominantPct,
                convergeRound, totalRounds, clickSequence, System.currentTimeMillis());
        return template.insert(FilterBubbleResult.class).using(entity).then();
    }

    /**
     * 查询全站统计数据。
     */
    public Mono<FilterBubbleStatsResponse> stats() {
        return ServiceSupport.selectAll(template, FilterBubbleResult.class)
                .map(this::buildStatsResponse);
    }

    private FilterBubbleStatsResponse buildStatsResponse(List<FilterBubbleResult> rows) {
        if (rows.isEmpty()) {
            return new FilterBubbleStatsResponse(0, 0, 0, 0, Map.of());
        }

        long total = rows.size();
        double avgDrop = ServiceSupport.round(
                rows.stream().mapToDouble(FilterBubbleResult::entropyDrop).average().orElse(0), 1);
        double avgPct = ServiceSupport.round(
                rows.stream().mapToDouble(FilterBubbleResult::dominantPct).average().orElse(0), 1);
        double avgConverge = ServiceSupport.round(
                rows.stream()
                        .filter(r -> r.convergeRound() > 0)
                        .mapToInt(FilterBubbleResult::convergeRound)
                        .average().orElse(0), 1);

        Map<String, Long> catDist = rows.stream()
                .collect(Collectors.groupingBy(FilterBubbleResult::dominantCat, LinkedHashMap::new, Collectors.counting()));

        return new FilterBubbleStatsResponse(total, avgDrop, avgPct, avgConverge, catDist);
    }
}
