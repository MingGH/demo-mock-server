package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public class SecKillStatsService {

    private static final Logger log = LoggerFactory.getLogger(SecKillStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS seckill_stats (
            id            BIGINT AUTO_INCREMENT PRIMARY KEY,
            participants  INT       NOT NULL,
            stock         INT       NOT NULL,
            user_won      TINYINT   NOT NULL,
            user_rank     INT       NOT NULL,
            user_latency  DOUBLE    NOT NULL,
            latency_gap   DOUBLE    NOT NULL,
            created_at    BIGINT    NOT NULL,
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO seckill_stats
          (participants, stock, user_won, user_rank, user_latency, latency_gap, created_at)
        VALUES (?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total_runs,
          SUM(user_won) AS total_wins,
          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
        FROM seckill_stats
        """;

    private static final String SQL_SCENARIO_STATS = """
        SELECT participants, stock,
          COUNT(*) AS cnt,
          SUM(user_won) AS wins,
          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
        FROM seckill_stats
        GROUP BY participants, stock
        ORDER BY cnt DESC
        LIMIT 10
        """;

    private final MySQLPool pool;

    public SecKillStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("seckill_stats init failed: {}", ar.cause().getMessage());
            else log.info("seckill_stats table ready");
        });
    }

    public Future<JsonObject> submit(int participants, int stock, boolean userWon,
                                      int userRank, double userLatency, double latencyGap) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(participants, stock, userWon ? 1 : 0,
                userRank, userLatency, latencyGap, now))
            .compose(ignored -> pool.query(SQL_STATS).execute())
            .map(rows -> {
                var row = rows.iterator().next();
                long totalRuns = row.getLong("total_runs");
                long totalWins = row.getLong("total_wins");
                double winRate = row.getDouble("win_rate");
                return new JsonObject()
                    .put("totalRuns", totalRuns)
                    .put("totalWins", totalWins)
                    .put("winRate", winRate);
            });
    }

    public Future<JsonObject> stats() {
        return pool.query(SQL_STATS).execute()
            .compose(rows -> {
                var row = rows.iterator().next();
                long totalRuns = row.getLong("total_runs");
                if (totalRuns == 0) {
                    return Future.succeededFuture(new JsonObject()
                        .put("totalRuns", 0L)
                        .put("totalWins", 0L)
                        .put("winRate", 0.0)
                        .put("byScenario", new JsonArray()));
                }
                JsonObject global = new JsonObject()
                    .put("totalRuns", totalRuns)
                    .put("totalWins", row.getLong("total_wins"))
                    .put("winRate", row.getDouble("win_rate"));

                return pool.query(SQL_SCENARIO_STATS).execute().map(sRows -> {
                    JsonArray arr = new JsonArray();
                    sRows.forEach(sr -> arr.add(new JsonObject()
                        .put("participants", sr.getInteger("participants"))
                        .put("stock", sr.getInteger("stock"))
                        .put("count", sr.getLong("cnt"))
                        .put("wins", sr.getLong("wins"))
                        .put("winRate", sr.getDouble("win_rate"))));
                    return global.put("byScenario", arr);
                });
            });
    }
}
