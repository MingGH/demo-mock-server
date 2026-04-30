package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public class CascadeFailureService {

    private static final Logger log = LoggerFactory.getLogger(CascadeFailureService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS cascade_failure_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            topology        VARCHAR(16)  NOT NULL,
            coupling        TINYINT      NOT NULL,
            capacity        TINYINT      NOT NULL,
            strategy        VARCHAR(16)  NOT NULL,
            trigger_pos     VARCHAR(8),
            survival_rate   DOUBLE       NOT NULL,
            cascade_steps   SMALLINT     NOT NULL,
            max_component   SMALLINT     NOT NULL,
            total_nodes     SMALLINT     NOT NULL,
            score           SMALLINT     NOT NULL,
            created_at      BIGINT       NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_score   (score)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO cascade_failure_results
          (topology, coupling, capacity, strategy, trigger_pos,
           survival_rate, cascade_steps, max_component, total_nodes, score, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                   AS total_runs,
          ROUND(AVG(survival_rate), 3)               AS avg_survival,
          ROUND(AVG(cascade_steps), 1)               AS avg_steps,
          ROUND(AVG(score), 1)                       AS avg_score,
          ROUND(SUM(CASE WHEN survival_rate >= 0.8 THEN 1 ELSE 0 END) / COUNT(*), 3) AS high_survival_rate
        FROM cascade_failure_results
        """;

    private static final String SQL_TOPO_STATS = """
        SELECT topology,
          COUNT(*)                                   AS cnt,
          ROUND(AVG(survival_rate), 3)               AS avg_survival
        FROM cascade_failure_results
        GROUP BY topology
        ORDER BY cnt DESC
        """;

    private static final String SQL_LEADERBOARD = """
        SELECT topology, strategy, survival_rate, cascade_steps, score, created_at
        FROM cascade_failure_results
        ORDER BY score DESC, survival_rate DESC
        LIMIT ?
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM cascade_failure_results";

    private final MySQLPool pool;

    public CascadeFailureService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("cascade_failure_results init failed: {}", ar.cause().getMessage());
            else log.info("cascade_failure_results table ready");
        });
    }

    public Future<JsonObject> submit(String topology, int coupling, int capacity, String strategy,
                                     String triggerPos, double survivalRate, int cascadeSteps,
                                     int maxComponent, int totalNodes, int score) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(topology, coupling, capacity, strategy, triggerPos,
                survivalRate, cascadeSteps, maxComponent, totalNodes, score, now))
            .compose(ignored -> pool.query(SQL_TOTAL).execute())
            .map(rows -> {
                long total = rows.iterator().next().getLong("total");
                return new JsonObject().put("totalRuns", total).put("yourScore", score);
            });
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalRuns", row.getLong("total_runs"))
                .put("avgSurvival", row.getDouble("avg_survival"))
                .put("avgSteps", row.getDouble("avg_steps"))
                .put("avgScore", row.getDouble("avg_score"))
                .put("highSurvivalRate", row.getDouble("high_survival_rate"));
        });

        Future<JsonArray> topoFuture = pool.query(SQL_TOPO_STATS).execute().map(rows -> {
            JsonArray arr = new JsonArray();
            rows.forEach(row -> arr.add(new JsonObject()
                .put("topology", row.getString("topology"))
                .put("count", row.getLong("cnt"))
                .put("avgSurvival", row.getDouble("avg_survival"))));
            return arr;
        });

        return Future.all(globalFuture, topoFuture).map(cf ->
            new JsonObject()
                .put("global", cf.<JsonObject>resultAt(0))
                .put("byTopology", cf.<JsonArray>resultAt(1))
        );
    }

    public Future<JsonObject> leaderboard(int limit) {
        return pool.preparedQuery(SQL_LEADERBOARD).execute(Tuple.of(limit))
            .compose(rows -> pool.query(SQL_TOTAL).execute().map(totalRows -> {
                long total = totalRows.iterator().next().getLong("total");
                JsonArray list = new JsonArray();
                int rank = 1;
                for (var row : rows) {
                    list.add(new JsonObject()
                        .put("rank", rank++)
                        .put("topology", row.getString("topology"))
                        .put("strategy", row.getString("strategy"))
                        .put("survivalRate", row.getDouble("survival_rate"))
                        .put("cascadeSteps", row.getInteger("cascade_steps"))
                        .put("score", row.getInteger("score"))
                        .put("time", row.getLong("created_at")));
                }
                return new JsonObject().put("leaders", list).put("total", total);
            }));
    }
}
