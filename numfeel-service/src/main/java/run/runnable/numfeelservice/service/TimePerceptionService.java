package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.TimePerceptionResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Comparator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 时间感知扭曲实验室 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class TimePerceptionService {

    private final R2dbcEntityTemplate template;

    public TimePerceptionService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<TimePerceptionSubmitResponse> submit(String playerName, int totalScore, double weberScore,
                                                     double avgAbsDistortion,
                                                     double blankAvgDistortion, double loadAvgDistortion,
                                                     double emotionAvgDistortion, String biasDirection, String grade) {
        TimePerceptionResult entity = new TimePerceptionResult(
                null, playerName, totalScore, weberScore, avgAbsDistortion, blankAvgDistortion,
                loadAvgDistortion, emotionAvgDistortion, biasDirection, grade, System.currentTimeMillis());
        return template.insert(TimePerceptionResult.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, TimePerceptionResult.class))
                .map(rows -> new TimePerceptionSubmitResponse(rankByScore(rows, totalScore), rows.size()));
    }

    public Mono<TimePerceptionStatsResponse> stats() {
        return ServiceSupport.selectAll(template, TimePerceptionResult.class)
                .map(this::toStatsResponse);
    }

    public Mono<TimePerceptionLeaderboardResponse> leaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 100);
        return ServiceSupport.selectAll(template, TimePerceptionResult.class)
                .map(rows -> toLeaderboardResponse(rows, safeLimit));
    }

    /** 仅按总分计算当前玩家名次，高分优先。 */
    private long rankByScore(List<TimePerceptionResult> rows, int totalScore) {
        return rows.stream().filter(row -> row.totalScore() > totalScore).count() + 1;
    }

    /** 聚合时间知觉实验的均值指标与评级分布。 */
    private TimePerceptionStatsResponse toStatsResponse(List<TimePerceptionResult> rows) {
        TimePerceptionGlobalStats global = new TimePerceptionGlobalStats(
                rows.size(),
                round1(rows.stream().mapToInt(TimePerceptionResult::totalScore).average().orElse(0)),
                round4(rows.stream().mapToDouble(TimePerceptionResult::avgAbsDistortion).average().orElse(0)),
                round4(rows.stream().mapToDouble(TimePerceptionResult::weberScore).average().orElse(0)),
                round4(rows.stream().mapToDouble(TimePerceptionResult::blankAvgDistortion).average().orElse(0)),
                round4(rows.stream().mapToDouble(TimePerceptionResult::loadAvgDistortion).average().orElse(0)),
                round4(rows.stream().mapToDouble(TimePerceptionResult::emotionAvgDistortion).average().orElse(0)),
                rows.isEmpty() ? 0.0 : round3(rows.stream().filter(row -> "overestimator".equals(row.biasDirection())).count() / (double) rows.size()),
                rows.isEmpty() ? 0.0 : round3(rows.stream().filter(row -> "underestimator".equals(row.biasDirection())).count() / (double) rows.size())
        );

        Map<String, Long> gradeDist = new LinkedHashMap<>(ServiceSupport.countBy(rows, TimePerceptionResult::grade));
        return new TimePerceptionStatsResponse(global, gradeDist);
    }

    /** 构建排行榜响应，保持与前端展示一致的总数与排名规则。 */
    private TimePerceptionLeaderboardResponse toLeaderboardResponse(List<TimePerceptionResult> rows, int safeLimit) {
        List<TimePerceptionResult> sortedRows = ServiceSupport.sorted(
                rows,
                Comparator.comparingInt(TimePerceptionResult::totalScore).reversed()
        );
        List<TimePerceptionLeaderboardEntry> leaders = buildLeaderboard(sortedRows, safeLimit);
        return new TimePerceptionLeaderboardResponse(leaders, rows.size());
    }

    /** 对分数相同的玩家赋予并列名次。 */
    private List<TimePerceptionLeaderboardEntry> buildLeaderboard(List<TimePerceptionResult> rows, int limit) {
        List<TimePerceptionLeaderboardEntry> leaders = new ArrayList<>();
        int rank = 0;
        int prevScore = Integer.MIN_VALUE;
        int index = 0;
        for (TimePerceptionResult row : rows.stream().limit(limit).toList()) {
            index++;
            if (row.totalScore() != prevScore) {
                rank = index;
                prevScore = row.totalScore();
            }
            leaders.add(new TimePerceptionLeaderboardEntry(
                    rank,
                    row.playerName(),
                    row.totalScore(),
                    row.grade(),
                    row.weberScore()
            ));
        }
        return leaders;
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }

    private double round3(double value) {
        return ServiceSupport.round(value, 3);
    }

    private double round4(double value) {
        return ServiceSupport.round(value, 4);
    }
}
