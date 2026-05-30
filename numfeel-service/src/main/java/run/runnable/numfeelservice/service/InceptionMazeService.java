package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayRequests.InceptionMazeSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InceptionMazeStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InceptionMazeSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.InceptionMazeResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 筑梦师测试 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class InceptionMazeService {

    private final R2dbcEntityTemplate template;

    public InceptionMazeService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<InceptionMazeSubmitResponse> submit(InceptionMazeSubmitRequest request) {
        double detourRatio = request.detourRatio();
        InceptionMazeResult entity = new InceptionMazeResult(
                null,
                request.gridSize(),
                request.pathLength(),
                request.minPath(),
                detourRatio,
                request.dreamLevel(),
                request.wallCount(),
                System.currentTimeMillis()
        );

        return template.insert(InceptionMazeResult.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, InceptionMazeResult.class))
                .map(rows -> toSubmitResponse(rows, detourRatio));
    }

    /** 查询筑梦迷宫全局统计，包括绕路系数、路径长度与梦境层级分布。 */
    public Mono<InceptionMazeStatsResponse> stats() {
        return ServiceSupport.selectAll(template, InceptionMazeResult.class)
                .map(this::toStatsResponse);
    }

    /** 根据绕路系数计算当前结果的历史排名和百分位。 */
    private InceptionMazeSubmitResponse toSubmitResponse(java.util.List<InceptionMazeResult> rows, double detourRatio) {
        long rank = rows.stream().filter(row -> row.detourRatio() < detourRatio).count() + 1;
        long total = rows.size();
        int percentile = total > 1
                ? (int) Math.round((1.0 - (double) rank / total) * 100.0)
                : 50;
        return new InceptionMazeSubmitResponse(rank, total, percentile);
    }

    /** 聚合样本均值与分布数据，供前端概览卡片和分布图使用。 */
    private InceptionMazeStatsResponse toStatsResponse(java.util.List<InceptionMazeResult> rows) {
        return new InceptionMazeStatsResponse(
                rows.size(),
                round2(rows.stream().mapToDouble(InceptionMazeResult::detourRatio).average().orElse(0)),
                round2(rows.stream().mapToDouble(InceptionMazeResult::detourRatio).max().orElse(0)),
                round1(rows.stream().mapToInt(InceptionMazeResult::pathLength).average().orElse(0)),
                round1(rows.stream().mapToInt(InceptionMazeResult::wallCount).average().orElse(0)),
                buildLevelDistribution(rows)
        );
    }

    /** 统计 0-5 层梦境样本数量，保持固定顺序返回。 */
    private Map<String, Long> buildLevelDistribution(java.util.List<InceptionMazeResult> rows) {
        Map<String, Long> levelDist = new LinkedHashMap<>();
        for (int i = 0; i <= 5; i++) {
            int level = i;
            levelDist.put(String.valueOf(i), rows.stream().filter(row -> row.dreamLevel() == level).count());
        }
        return levelDist;
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }

    private double round2(double value) {
        return ServiceSupport.round(value, 2);
    }
}
