package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillScenarioStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SecKillStat;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
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

    public Mono<SecKillSubmitResponse> submit(int participants, int stock, boolean userWon,
                                             int userRank, double userLatency, double latencyGap) {
        SecKillStat entity = new SecKillStat(
                null, participants, stock, userWon, userRank, userLatency, latencyGap, System.currentTimeMillis());
        return template.insert(SecKillStat.class).using(entity).then(submitStats());
    }

    private Mono<SecKillSubmitResponse> submitStats() {
        DatabaseClient client = template.getDatabaseClient();
        return client.sql("""
                        SELECT
                          COUNT(*) AS total_runs,
                          SUM(user_won) AS total_wins,
                          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
                        FROM seckill_stats
                        """)
                .map((row, metadata) -> new SecKillSubmitResponse(
                        number(row.get("total_runs")).longValue(),
                        number(row.get("total_wins")).longValue(),
                        number(row.get("win_rate")).doubleValue()
                ))
                .one()
                .defaultIfEmpty(new SecKillSubmitResponse(0, 0, 0.0));
    }

    /** 查询秒杀实验总胜率，并按参与人数与库存组合返回热门场景统计。 */
    public Mono<SecKillStatsResponse> stats() {
        DatabaseClient client = template.getDatabaseClient();
        Mono<SecKillStatsResponse> empty = Mono.just(new SecKillStatsResponse(0, 0, 0.0, List.of()));
        Mono<SecKillStatsResponse> statsMono = client.sql("""
                        SELECT
                          COUNT(*) AS total_runs,
                          SUM(user_won) AS total_wins,
                          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
                        FROM seckill_stats
                        """)
                .map((row, metadata) -> new SecKillStatsResponse(
                        number(row.get("total_runs")).longValue(),
                        number(row.get("total_wins")).longValue(),
                        number(row.get("win_rate")).doubleValue(),
                        List.of()
                ))
                .one()
                .switchIfEmpty(empty);
        Mono<List<SecKillScenarioStats>> scenariosMono = client.sql("""
                        SELECT participants, stock,
                          COUNT(*) AS cnt,
                          SUM(user_won) AS wins,
                          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
                        FROM seckill_stats
                        GROUP BY participants, stock
                        ORDER BY cnt DESC
                        LIMIT 10
                        """)
                .map((row, metadata) -> new SecKillScenarioStats(
                        number(row.get("participants")).intValue(),
                        number(row.get("stock")).intValue(),
                        number(row.get("cnt")).intValue(),
                        number(row.get("wins")).longValue(),
                        number(row.get("win_rate")).doubleValue()
                ))
                .all()
                .collectList();
        return Mono.zip(statsMono, scenariosMono)
                .map(tuple -> new SecKillStatsResponse(
                        tuple.getT1().totalRuns(),
                        tuple.getT1().totalWins(),
                        tuple.getT1().winRate(),
                        tuple.getT2()
                ));
    }

    private Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
