package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public class MonkeyStatsService {

    private static final Logger log = LoggerFactory.getLogger(MonkeyStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS monkey_stats (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            target_text     VARCHAR(12)  NOT NULL,
            target_length   TINYINT      NOT NULL,
            total_attempts  BIGINT       NOT NULL,
            total_chars     BIGINT       NOT NULL,
            success         TINYINT      NOT NULL,
            time_elapsed    INT          NOT NULL,
            created_at      BIGINT       NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_success (success)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO monkey_stats
          (target_text, target_length, total_attempts, total_chars, success, time_elapsed, created_at)
        VALUES (?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total_runs,
          SUM(success) AS total_successes,
          ROUND(SUM(success) / COUNT(*), 3) AS success_rate
        FROM monkey_stats
        """;

    private static final String SQL_LONGEST = """
        SELECT target_text, target_length, total_attempts, total_chars, time_elapsed, success
        FROM monkey_stats
        WHERE success = 1
        ORDER BY target_length DESC, total_attempts ASC
        LIMIT 1
        """;

    private static final String SQL_LEADERBOARD = """
        SELECT target_text, target_length, total_attempts, total_chars, time_elapsed, success
        FROM monkey_stats
        ORDER BY target_length DESC, total_attempts ASC
        LIMIT 10
        """;

    private final MySQLPool pool;

    public MonkeyStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("monkey_stats init failed: {}", ar.cause().getMessage());
            else log.info("monkey_stats table ready");
        });
    }

    public Future<JsonObject> submit(String targetText, int targetLength, long totalAttempts,
                                      long totalChars, boolean success, int timeElapsed) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(targetText, targetLength, totalAttempts, totalChars,
                success ? 1 : 0, timeElapsed, now))
            .compose(ignored -> pool.query(SQL_STATS).execute())
            .compose(rows -> {
                var row = rows.iterator().next();
                long totalRuns = row.getLong("total_runs");
                long totalSuccesses = row.getLong("total_successes");
                double successRate = row.getDouble("success_rate");

                return pool.query(SQL_LONGEST).execute().map(lr -> {
                    JsonObject result = new JsonObject()
                        .put("totalRuns", totalRuns)
                        .put("totalSuccesses", totalSuccesses)
                        .put("successRate", successRate);
                    if (lr.size() > 0) {
                        var lrow = lr.iterator().next();
                        result.put("longestTarget", lrow.getString("target_text"));
                    }
                    return result;
                });
            });
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> statsFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            long totalRuns = row.getLong("total_runs");
            if (totalRuns == 0) {
                return new JsonObject()
                    .put("totalRuns", 0L)
                    .put("totalSuccesses", 0L)
                    .put("successRate", 0.0);
            }
            return new JsonObject()
                .put("totalRuns", totalRuns)
                .put("totalSuccesses", row.getLong("total_successes"))
                .put("successRate", row.getDouble("success_rate"));
        });

        Future<JsonObject> longestFuture = pool.query(SQL_LONGEST).execute().map(rows -> {
            if (rows.size() > 0) {
                var row = rows.iterator().next();
                return new JsonObject().put("longestTarget", row.getString("target_text"))
                    .put("targetLength", row.getInteger("target_length"));
            }
            return new JsonObject();
        });

        Future<JsonArray> leaderboardFuture = pool.query(SQL_LEADERBOARD).execute().map(rows -> {
            JsonArray arr = new JsonArray();
            rows.forEach(row -> arr.add(new JsonObject()
                .put("targetText", row.getString("target_text"))
                .put("targetLength", row.getInteger("target_length"))
                .put("totalAttempts", row.getLong("total_attempts"))
                .put("success", row.getInteger("success") == 1)));
            return arr;
        });

        return Future.all(statsFuture, longestFuture, leaderboardFuture).map(cf ->
            cf.<JsonObject>resultAt(0)
                .put("longestTarget", cf.<JsonObject>resultAt(1).getString("longestTarget", null))
                .put("leaderboard", cf.<JsonArray>resultAt(2))
        );
    }
}
