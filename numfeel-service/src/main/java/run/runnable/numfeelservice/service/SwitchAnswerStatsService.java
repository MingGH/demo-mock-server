package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.DailyTrend;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SwitchAnswerRound;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 排除选项改答案 — 业务逻辑层。
 * <p>
 * 记录用户每一轮的决策结果，并聚合全局统计与最近 7 天趋势。
 */
@Service
public class SwitchAnswerStatsService {

    private final R2dbcEntityTemplate template;

    public SwitchAnswerStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一轮决策结果，返回当前最新统计快照。
     *
     * @param strategy  策略："stay" 或 "switch"
     * @param won       本轮是否答对
     * @param options   选项总数 N
     * @param eliminated 排除数量 K
     * @param ip        用户 IP（用于粗略去重）
     * @return 提交成功后的统计快照
     */
    public Mono<SwitchAnswerSubmitResponse> submit(String strategy, boolean won, int options,
                                                   int eliminated, String ip) {
        SwitchAnswerRound entity = new SwitchAnswerRound(
                null, strategy, won, options, eliminated, ip, System.currentTimeMillis());
        return template.insert(SwitchAnswerRound.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, SwitchAnswerRound.class))
                .map(this::toSubmitResponse);
    }

    /**
     * 查询全局统计数据，含最近 7 天每日趋势。
     *
     * @return 全局统计响应
     */
    public Mono<SwitchAnswerStatsResponse> stats() {
        return ServiceSupport.selectAll(template, SwitchAnswerRound.class)
                .map(this::toStatsResponse);
    }

    private SwitchAnswerSubmitResponse toSubmitResponse(List<SwitchAnswerRound> rows) {
        long stayRounds = rows.stream().filter(r -> "stay".equals(r.strategy())).count();
        long stayWins = rows.stream().filter(r -> "stay".equals(r.strategy()) && r.won()).count();
        long switchRounds = rows.stream().filter(r -> "switch".equals(r.strategy())).count();
        long switchWins = rows.stream().filter(r -> "switch".equals(r.strategy()) && r.won()).count();
        long lastUpdated = rows.stream().mapToLong(SwitchAnswerRound::createdAt).max()
                .orElse(System.currentTimeMillis());
        return new SwitchAnswerSubmitResponse(
                rows.size(),
                stayRounds, stayWins, ServiceSupport.ratio(stayWins, stayRounds, 3),
                switchRounds, switchWins, ServiceSupport.ratio(switchWins, switchRounds, 3),
                lastUpdated
        );
    }

    private SwitchAnswerStatsResponse toStatsResponse(List<SwitchAnswerRound> rows) {
        long stayRounds = rows.stream().filter(r -> "stay".equals(r.strategy())).count();
        long stayWins = rows.stream().filter(r -> "stay".equals(r.strategy()) && r.won()).count();
        long switchRounds = rows.stream().filter(r -> "switch".equals(r.strategy())).count();
        long switchWins = rows.stream().filter(r -> "switch".equals(r.strategy()) && r.won()).count();
        // 按日去重 IP 粗略估计参与人数
        long participantCount = rows.stream()
                .map(r -> dateOf(r.createdAt()) + "|" + (r.ip() == null ? "" : r.ip()))
                .distinct()
                .count();
        List<DailyTrend> trend = buildTrend(rows);
        return new SwitchAnswerStatsResponse(
                rows.size(),
                stayRounds, stayWins, ServiceSupport.ratio(stayWins, stayRounds, 3),
                switchRounds, switchWins, ServiceSupport.ratio(switchWins, switchRounds, 3),
                participantCount, trend
        );
    }

    /** 最近 7 天每日趋势：[stayRounds, stayWins, switchRounds, switchWins, total]。 */
    private List<DailyTrend> buildTrend(List<SwitchAnswerRound> rows) {
        Map<String, long[]> byDate = new TreeMap<>();
        for (SwitchAnswerRound r : rows) {
            String d = dateOf(r.createdAt());
            long[] arr = byDate.computeIfAbsent(d, k -> new long[5]);
            if ("stay".equals(r.strategy())) {
                arr[0]++;
                if (r.won()) arr[1]++;
            } else {
                arr[2]++;
                if (r.won()) arr[3]++;
            }
            arr[4]++;
        }
        List<DailyTrend> trend = new ArrayList<>();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (int i = 6; i >= 0; i--) {
            String d = today.minusDays(i).toString();
            long[] arr = byDate.get(d);
            if (arr != null) {
                trend.add(new DailyTrend(d,
                        ServiceSupport.ratio(arr[1], arr[0], 3),
                        ServiceSupport.ratio(arr[3], arr[2], 3),
                        arr[4]));
            } else {
                trend.add(new DailyTrend(d, 0.0, 0.0, 0L));
            }
        }
        return trend;
    }

    private String dateOf(long millis) {
        return Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString();
    }
}
