package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.TrustGameStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.TrustGameResult;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 信任博弈 — 业务逻辑层。
 * 持久化玩家两阶段决策结果，聚合全站信任/互惠度统计。
 * <p>
 * 聚合统计（COUNT / AVG / GROUP BY invest_amount）走 DatabaseClient 原生 SQL，
 * 不做全表物化；结果经 {@link Cacheable} 缓存 60 秒，提交时 {@link CacheEvict} 保证新数据立即可见。
 */
@Service
public class TrustGameService {

    /** 全站聚合：记录数 + 平均投资额 + 平均返还额。 */
    private static final String AGG_SQL =
            "SELECT COUNT(*) AS total, COALESCE(AVG(invest_amount), 0) AS avg_invest, " +
                    "COALESCE(AVG(return_amount), 0) AS avg_return FROM trust_game_results";

    /** 投资额 0-10 分组计数，用于分布图。 */
    private static final String DIST_SQL =
            "SELECT invest_amount, COUNT(*) AS cnt FROM trust_game_results GROUP BY invest_amount";

    private final R2dbcEntityTemplate template;
    private final DatabaseClient db;

    public TrustGameService(R2dbcEntityTemplate template, DatabaseClient db) {
        this.template = template;
        this.db = db;
    }

    /**
     * 提交一次信任博弈结果。
     *
     * @param sessionId    客户端会话 ID
     * @param investAmount 投资额（0-10）
     * @param returnAmount 被委托人时返还额（0-30）
     * @param totalEarned  两阶段总收益
     * @param roleOrder    角色顺序 0=先投后返 1=先返后投
     * @return 完成信号
     */
    @CacheEvict(cacheNames = "trustGameStats", allEntries = true)
    public Mono<Void> submit(String sessionId, int investAmount, int returnAmount,
                             int totalEarned, int roleOrder) {
        TrustGameResult entity = new TrustGameResult(
                null, sessionId, investAmount, returnAmount, totalEarned, roleOrder,
                System.currentTimeMillis());
        return template.insert(TrustGameResult.class).using(entity).then();
    }

    /**
     * 查询全站统计：记录数、平均投资额、平均返还额、投资额 0-10 分布（固定长度 11）。
     *
     * @return 聚合统计响应
     */
    @Cacheable(cacheNames = "trustGameStats", sync = true)
    public Mono<TrustGameStatsResponse> stats() {
        Mono<double[]> aggMono = db.sql(AGG_SQL)
                .map((row, metadata) -> new double[]{
                        number(row.get("total")).doubleValue(),
                        number(row.get("avg_invest")).doubleValue(),
                        number(row.get("avg_return")).doubleValue()})
                .one()
                .defaultIfEmpty(new double[]{0, 0, 0});
        Mono<List<long[]>> distMono = db.sql(DIST_SQL)
                .map((row, metadata) -> new long[]{
                        number(row.get("invest_amount")).longValue(),
                        number(row.get("cnt")).longValue()})
                .all()
                .collectList();
        return Mono.zip(aggMono, distMono)
                .map(t -> aggregateStats(
                        Math.round(t.getT1()[0]),
                        t.getT1()[1],
                        t.getT1()[2],
                        t.getT2()));
    }

    /**
     * 由 SQL 聚合结果组装统计响应（可独立单元测试的纯逻辑）。
     * 投资额分布固定输出 0-10 共 11 项，缺失档位补 0。
     *
     * @param total      记录总数
     * @param avgInvest  平均投资额
     * @param avgReturn  平均返还额
     * @param distRows   分组计数行（每行 {@code [invest_amount, cnt]}）
     * @return 聚合统计响应
     */
    static TrustGameStatsResponse aggregateStats(long total, double avgInvest,
                                                 double avgReturn, List<long[]> distRows) {
        long[] counts = new long[11];
        for (long[] row : distRows) {
            int invest = (int) row[0];
            if (invest >= 0 && invest <= 10) {
                counts[invest] = row[1];
            }
        }
        List<Long> dist = new ArrayList<>(11);
        for (int i = 0; i <= 10; i++) {
            dist.add(counts[i]);
        }
        return new TrustGameStatsResponse(
                total,
                ServiceSupport.round(avgInvest, 1),
                ServiceSupport.round(avgReturn, 1),
                dist);
    }

    private static Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
