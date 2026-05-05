package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 宇宙收割者假说 — 数据服务
 */
public class CosmicReaperService {

    private static final Logger log = LoggerFactory.getLogger(CosmicReaperService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS cosmic_reaper_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            strategy        VARCHAR(16)  NOT NULL,
            escaped         TINYINT(1)   NOT NULL DEFAULT 0,
            turns           SMALLINT     NOT NULL,
            score           SMALLINT     NOT NULL,
            final_tech      SMALLINT     NOT NULL,
            final_signal    SMALLINT     NOT NULL,
            final_stealth   SMALLINT     NOT NULL,
            created_at      BIGINT       NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_score   (score)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO cosmic_reaper_results
          (strategy, escaped, turns, score, final_tech, final_signal, final_stealth, created_at)
        VALUES (?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                                    AS total_runs,
          ROUND(SUM(CASE WHEN escaped = 1 THEN 1 ELSE 0 END) * 100.0 / GREATEST(COUNT(*), 1), 1) AS escape_rate,
          ROUND(AVG(score), 1)                                       AS avg_score,
          ROUND(AVG(turns), 1)                                       AS avg_turns
        FROM cosmic_reaper_results
        """;

    private static final String SQL_TOP_STRATEGY = """
        SELECT strategy, COUNT(*) AS cnt
        FROM cosmic_reaper_results
        GROUP BY strategy
        ORDER BY cnt DESC
        LIMIT 1
        """;

    private final MySQLPool pool;

    public CosmicReaperService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("cosmic_reaper_results init failed: {}", ar.cause().getMessage());
            else log.info("cosmic_reaper_results table ready");
        });
    }

    public Future<JsonObject> submit(String strategy, boolean escaped, int turns, int score,
                                     int finalTech, int finalSignal, int finalStealth) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(strategy, escaped ? 1 : 0, turns, score,
                finalTech, finalSignal, finalStealth, now))
            .compose(ignored -> getStats());
    }

    public Future<JsonObject> getStats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            long totalRuns = row.getLong("total_runs");
            JsonObject obj = new JsonObject().put("totalRuns", totalRuns);
            if (totalRuns == 0) {
                obj.put("escapeRate", 0.0).put("avgScore", 0.0).put("avgTurns", 0.0);
            } else {
                obj.put("escapeRate", row.getDouble("escape_rate"))
                   .put("avgScore", row.getDouble("avg_score"))
                   .put("avgTurns", row.getDouble("avg_turns"));
            }
            return obj;
        });

        Future<String> topStrategyFuture = pool.query(SQL_TOP_STRATEGY).execute().map(rows -> {
            if (rows.size() == 0) return "-";
            return rows.iterator().next().getString("strategy");
        });

        return Future.all(globalFuture, topStrategyFuture).map(cf -> {
            JsonObject result = cf.<JsonObject>resultAt(0);
            result.put("topStrategy", cf.<String>resultAt(1));
            return result;
        });
    }
}
