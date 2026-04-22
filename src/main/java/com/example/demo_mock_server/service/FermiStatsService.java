package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 费米估算挑战 — 业务逻辑层
 */
public class FermiStatsService {

    private static final Logger log = LoggerFactory.getLogger(FermiStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS fermi_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            avg_oom         DOUBLE      NOT NULL,
            within_oom      SMALLINT    NOT NULL,
            grade           VARCHAR(4)  NOT NULL,
            created_at      BIGINT      NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_grade   (grade)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO fermi_results (avg_oom, within_oom, grade, created_at)
        VALUES (?, ?, ?, ?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                          AS total_sessions,
          ROUND(AVG(avg_oom), 2)            AS avg_oom,
          ROUND(AVG(within_oom), 1)         AS avg_within_oom
        FROM fermi_results
        """;

    private static final String SQL_GRADE_DIST = """
        SELECT grade, COUNT(*) AS cnt
        FROM fermi_results
        GROUP BY grade
        ORDER BY cnt DESC
        """;

    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM fermi_results
        WHERE avg_oom < ?
        """;

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM fermi_results
        """;

    private final MySQLPool pool;

    public FermiStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("fermi_results init failed: {}", ar.cause().getMessage());
            else log.info("fermi_results table ready");
        });
    }

    public Future<JsonObject> submit(double avgOOM, int withinOOM, String grade) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(avgOOM, withinOOM, grade, now))
            .compose(ignored -> pool.preparedQuery(SQL_RANK).execute(Tuple.of(avgOOM)))
            .compose(rankRows -> {
                long rank = rankRows.iterator().next().getLong("rank");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long totalSessions = totalRows.iterator().next().getLong("total");
                    double percentile = totalSessions > 0
                        ? Math.round((1.0 - (double) rank / totalSessions) * 100)
                        : 50;
                    return new JsonObject()
                        .put("rank", rank)
                        .put("totalSessions", totalSessions)
                        .put("percentile", percentile);
                });
            });
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgOOM", row.getDouble("avg_oom"))
                .put("avgWithinOOM", row.getDouble("avg_within_oom"));
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
