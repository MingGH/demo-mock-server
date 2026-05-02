package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Set;

/**
 * 纽科姆悖论 — 业务逻辑层
 * <p>
 * 记录每次用户选择（一箱/两箱）、预测器预测、是否命中、收益，
 * 提供全局统计（参与人数、一箱/两箱比例、命中率、平均收益）。
 */
public class NewcombService {

    private static final Logger log = LoggerFactory.getLogger(NewcombService.class);

    private static final Set<String> VALID_CHOICES = Set.of("one", "two");

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS newcomb_results (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            choice      VARCHAR(4)  NOT NULL,
            prediction  VARCHAR(4)  NOT NULL,
            hit         TINYINT(1)  NOT NULL,
            payoff      INT         NOT NULL,
            created_at  BIGINT      NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_choice  (choice)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO newcomb_results (choice, prediction, hit, payoff, created_at)
        VALUES (?, ?, ?, ?, ?)
        """;

    private static final String SQL_STATS = """
        SELECT
            COUNT(*)                                    AS total,
            SUM(CASE WHEN choice = 'one' THEN 1 ELSE 0 END)  AS one_box,
            SUM(CASE WHEN choice = 'two' THEN 1 ELSE 0 END)  AS two_box,
            SUM(hit)                                    AS hits,
            ROUND(AVG(CASE WHEN choice = 'one' THEN payoff END))  AS avg_one_payoff,
            ROUND(AVG(CASE WHEN choice = 'two' THEN payoff END))  AS avg_two_payoff
        FROM newcomb_results
        """;

    private final MySQLPool pool;

    public NewcombService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) {
                log.error("newcomb_results init failed: {}", ar.cause().getMessage());
            } else {
                log.info("newcomb_results table ready");
            }
        });
    }

    /**
     * 校验选择是否合法
     */
    public boolean isValidChoice(String choice) {
        return choice != null && VALID_CHOICES.contains(choice);
    }

    /**
     * 提交一次选择结果，返回全局统计
     */
    public Future<JsonObject> submit(String choice, String prediction, boolean hit, int payoff) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(choice, prediction, hit ? 1 : 0, payoff, now))
            .compose(ignored -> queryStats());
    }

    /**
     * 查询全局统计
     */
    public Future<JsonObject> stats() {
        return queryStats();
    }

    private Future<JsonObject> queryStats() {
        return pool.query(SQL_STATS).execute().map(rows -> {
            Row row = rows.iterator().next();
            long total   = row.getLong("total");
            long oneBox  = row.getLong("one_box");
            long twoBox  = row.getLong("two_box");
            long hits    = row.getLong("hits");

            Double avgOnePayoff = row.getDouble("avg_one_payoff");
            Double avgTwoPayoff = row.getDouble("avg_two_payoff");

            double hitRate = total > 0 ? Math.round((double) hits / total * 1000.0) / 10.0 : 0;
            double oneBoxPct = total > 0 ? Math.round((double) oneBox / total * 1000.0) / 10.0 : 0;
            double twoBoxPct = total > 0 ? Math.round((double) twoBox / total * 1000.0) / 10.0 : 0;

            return new JsonObject()
                .put("total", total)
                .put("oneBox", oneBox)
                .put("twoBox", twoBox)
                .put("hits", hits)
                .put("hitRate", hitRate)
                .put("oneBoxPct", oneBoxPct)
                .put("twoBoxPct", twoBoxPct)
                .put("avgOnePayoff", avgOnePayoff != null ? avgOnePayoff.longValue() : 0)
                .put("avgTwoPayoff", avgTwoPayoff != null ? avgTwoPayoff.longValue() : 0);
        });
    }
}
