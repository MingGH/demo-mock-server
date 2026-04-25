package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Set;

/**
 * 恶魔交易诊断 — 业务逻辑层
 * <p>
 * 记录每次测试结果（主/副契约类型、六维度百分比），
 * 提供全局聚合统计和契约类型分布。
 */
public class DevilDealService {

    private static final Logger log = LoggerFactory.getLogger(DevilDealService.class);

    private static final Set<String> VALID_TYPES = Set.of(
        "power", "love", "money", "revenge", "recognition", "knowledge"
    );

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS devil_deal_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            deal_type       VARCHAR(16)  NOT NULL,
            second_type     VARCHAR(16)  NOT NULL,
            power_pct       TINYINT      NOT NULL,
            love_pct        TINYINT      NOT NULL,
            money_pct       TINYINT      NOT NULL,
            revenge_pct     TINYINT      NOT NULL,
            recognition_pct TINYINT      NOT NULL,
            knowledge_pct   TINYINT      NOT NULL,
            created_at      BIGINT       NOT NULL,
            INDEX idx_created   (created_at),
            INDEX idx_deal_type (deal_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO devil_deal_results
          (deal_type, second_type, power_pct, love_pct, money_pct, revenge_pct, recognition_pct, knowledge_pct, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM devil_deal_results
        """;

    private static final String SQL_TYPE_DIST = """
        SELECT deal_type, COUNT(*) AS cnt
        FROM devil_deal_results
        GROUP BY deal_type
        ORDER BY cnt DESC
        """;

    private static final String SQL_AVG_PCTS = """
        SELECT
          COUNT(*)                          AS total_sessions,
          ROUND(AVG(power_pct), 1)          AS avg_power,
          ROUND(AVG(love_pct), 1)           AS avg_love,
          ROUND(AVG(money_pct), 1)          AS avg_money,
          ROUND(AVG(revenge_pct), 1)        AS avg_revenge,
          ROUND(AVG(recognition_pct), 1)    AS avg_recognition,
          ROUND(AVG(knowledge_pct), 1)      AS avg_knowledge
        FROM devil_deal_results
        """;

    private static final String SQL_SAME_TYPE_COUNT = """
        SELECT COUNT(*) AS cnt FROM devil_deal_results WHERE deal_type = ?
        """;

    private final MySQLPool pool;

    public DevilDealService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("devil_deal_results init failed: {}", ar.cause().getMessage());
            else log.info("devil_deal_results table ready");
        });
    }

    /**
     * 校验契约类型是否合法
     */
    public boolean isValidType(String type) {
        return type != null && VALID_TYPES.contains(type);
    }

    /**
     * 校验百分比是否在 0-100 范围内
     */
    public boolean isValidPct(Integer pct) {
        return pct != null && pct >= 0 && pct <= 100;
    }

    /**
     * 提交一次测试结果，返回同类型人数和总人数
     */
    public Future<JsonObject> submit(String dealType, String secondType,
                                     int powerPct, int lovePct, int moneyPct,
                                     int revengePct, int recognitionPct, int knowledgePct) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(dealType, secondType, powerPct, lovePct, moneyPct,
                              revengePct, recognitionPct, knowledgePct, now))
            .compose(ignored -> pool.preparedQuery(SQL_SAME_TYPE_COUNT).execute(Tuple.of(dealType)))
            .compose(sameRows -> {
                long sameCount = sameRows.iterator().next().getLong("cnt");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long total = totalRows.iterator().next().getLong("total");
                    double samePercent = total > 0
                        ? Math.round((double) sameCount / total * 1000.0) / 10.0
                        : 0;
                    return new JsonObject()
                        .put("sameCount", sameCount)
                        .put("total", total)
                        .put("samePercent", samePercent);
                });
            });
    }

    /**
     * 查询全局统计：契约类型分布 + 各维度平均值
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> avgFuture = pool.query(SQL_AVG_PCTS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgPower",       row.getDouble("avg_power"))
                .put("avgLove",        row.getDouble("avg_love"))
                .put("avgMoney",       row.getDouble("avg_money"))
                .put("avgRevenge",     row.getDouble("avg_revenge"))
                .put("avgRecognition", row.getDouble("avg_recognition"))
                .put("avgKnowledge",   row.getDouble("avg_knowledge"));
        });

        Future<JsonObject> distFuture = pool.query(SQL_TYPE_DIST).execute().map(rows -> {
            JsonObject dist = new JsonObject();
            rows.forEach(row -> dist.put(row.getString("deal_type"), row.getLong("cnt")));
            return dist;
        });

        return Future.all(avgFuture, distFuture).map(cf ->
            new JsonObject()
                .put("global", cf.<JsonObject>resultAt(0))
                .put("typeDist", cf.<JsonObject>resultAt(1))
        );
    }
}
