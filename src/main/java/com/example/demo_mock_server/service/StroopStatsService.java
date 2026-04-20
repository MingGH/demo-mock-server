package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 斯特鲁普效应挑战 — 业务逻辑层
 * <p>
 * 记录每次测试结果，提供全局聚合统计。
 */
public class StroopStatsService {

    private static final Logger log = LoggerFactory.getLogger(StroopStatsService.class);

    /* ── DDL ── */
    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS stroop_results (
            id                BIGINT AUTO_INCREMENT PRIMARY KEY,
            total             SMALLINT   NOT NULL,
            correct_count     SMALLINT   NOT NULL,
            accuracy          DOUBLE     NOT NULL,
            avg_rt            DOUBLE     NOT NULL,
            con_avg_rt        DOUBLE     NOT NULL,
            inc_avg_rt        DOUBLE     NOT NULL,
            stroop_effect     DOUBLE     NOT NULL,
            grade             VARCHAR(16) NOT NULL,
            created_at        BIGINT     NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_stroop  (stroop_effect)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    /* ── SQL ── */
    private static final String SQL_INSERT = """
        INSERT INTO stroop_results
          (total, correct_count, accuracy, avg_rt, con_avg_rt, inc_avg_rt, stroop_effect, grade, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                AS total_sessions,
          ROUND(AVG(stroop_effect), 1)            AS avg_stroop_effect,
          ROUND(AVG(avg_rt), 1)                   AS avg_rt,
          ROUND(AVG(accuracy) * 100, 1)           AS avg_accuracy_pct,
          ROUND(MIN(stroop_effect), 1)            AS min_stroop_effect,
          ROUND(MAX(stroop_effect), 1)            AS max_stroop_effect,
          ROUND(AVG(con_avg_rt), 1)               AS avg_con_rt,
          ROUND(AVG(inc_avg_rt), 1)               AS avg_inc_rt
        FROM stroop_results
        """;

    private static final String SQL_GRADE_DIST = """
        SELECT grade, COUNT(*) AS cnt
        FROM stroop_results
        GROUP BY grade
        ORDER BY cnt DESC
        """;

    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM stroop_results
        WHERE stroop_effect < ?
        """;

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM stroop_results
        """;

    private final MySQLPool pool;

    public StroopStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("stroop_results init failed: {}", ar.cause().getMessage());
            else log.info("stroop_results table ready");
        });
    }

    /**
     * 提交一次测试结果，返回排名信息
     */
    public Future<JsonObject> submit(int total, int correctCount, double accuracy,
                                     double avgRT, double conAvgRT, double incAvgRT,
                                     double stroopEffect, String grade) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(total, correctCount, accuracy, avgRT, conAvgRT, incAvgRT, stroopEffect, grade, now))
            .compose(ignored -> pool.preparedQuery(SQL_RANK).execute(Tuple.of(stroopEffect)))
            .compose(rankRows -> {
                long rank = rankRows.iterator().next().getLong("rank");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long totalSessions = totalRows.iterator().next().getLong("total");
                    return new JsonObject()
                        .put("rank", rank)
                        .put("totalSessions", totalSessions)
                        .put("percentile", Math.round((1.0 - (double) rank / totalSessions) * 100));
                });
            });
    }

    /**
     * 查询全局聚合统计 + 评级分布
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgStroopEffect", row.getDouble("avg_stroop_effect"))
                .put("avgRT", row.getDouble("avg_rt"))
                .put("avgAccuracyPct", row.getDouble("avg_accuracy_pct"))
                .put("minStroopEffect", row.getDouble("min_stroop_effect"))
                .put("maxStroopEffect", row.getDouble("max_stroop_effect"))
                .put("avgConRT", row.getDouble("avg_con_rt"))
                .put("avgIncRT", row.getDouble("avg_inc_rt"));
        });

        Future<JsonObject> gradeFuture = pool.query(SQL_GRADE_DIST).execute().map(rows -> {
            JsonObject dist = new JsonObject();
            rows.forEach(row -> dist.put(row.getString("grade"), row.getLong("cnt")));
            return dist;
        });

        return Future.all(globalFuture, gradeFuture).map(cf ->
            new JsonObject()
                .put("global", cf.<JsonObject>resultAt(0))
                .put("gradeDist", cf.<JsonObject>resultAt(1))
        );
    }
}
