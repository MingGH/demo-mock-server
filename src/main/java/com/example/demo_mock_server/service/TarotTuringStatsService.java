package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 塔罗图灵测试统计服务
 */
public class TarotTuringStatsService {

    private static final Logger log = LoggerFactory.getLogger(TarotTuringStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS tarot_turing_results (
            id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_seed       VARCHAR(64) NOT NULL,
            spread_id          VARCHAR(64) NOT NULL,
            best_slot          CHAR(1)     NOT NULL,
            best_role          VARCHAR(16) NOT NULL,
            guessed_ai_slot    CHAR(1)     NOT NULL,
            guessed_ai_role    VARCHAR(16) NOT NULL,
            guessed_ai_correct TINYINT(1)  NOT NULL,
            created_at         BIGINT      NOT NULL,
            INDEX idx_spread_id (spread_id),
            INDEX idx_best_role (best_role),
            INDEX idx_guessed_ai_role (guessed_ai_role),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO tarot_turing_results
          (session_seed, spread_id, best_slot, best_role, guessed_ai_slot, guessed_ai_role, guessed_ai_correct, created_at)
        VALUES (?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_OVERVIEW = """
        SELECT
          COUNT(*) AS total_sessions,
          ROUND(AVG(guessed_ai_correct) * 100, 1) AS guess_ai_accuracy_pct
        FROM tarot_turing_results
        """;

    private static final String SQL_BEST_ROLE = """
        SELECT best_role AS role, COUNT(*) AS cnt
        FROM tarot_turing_results
        GROUP BY best_role
        """;

    private static final String SQL_GUESSED_ROLE = """
        SELECT guessed_ai_role AS role, COUNT(*) AS cnt
        FROM tarot_turing_results
        GROUP BY guessed_ai_role
        """;

    private final MySQLPool pool;

    public TarotTuringStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) {
                log.error("tarot_turing_results init failed: {}", ar.cause().getMessage());
            } else {
                log.info("tarot_turing_results table ready");
            }
        });
    }

    public Future<Void> submit(String sessionSeed,
                               String spreadId,
                               String bestSlot,
                               String bestRole,
                               String guessedAiSlot,
                               String guessedAiRole,
                               boolean guessedAiCorrect) {
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(
                sessionSeed,
                spreadId,
                bestSlot,
                bestRole,
                guessedAiSlot,
                guessedAiRole,
                guessedAiCorrect ? 1 : 0,
                Instant.now().toEpochMilli()
            ))
            .mapEmpty();
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> overviewFuture = pool.query(SQL_OVERVIEW).execute().map(rows -> {
            var row = rows.iterator().next();
            Double guessAiAccuracyPct = row.getDouble("guess_ai_accuracy_pct");
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("guessAiAccuracyPct", guessAiAccuracyPct == null ? 0.0 : guessAiAccuracyPct);
        });

        Future<JsonObject> bestRoleFuture = pool.query(SQL_BEST_ROLE).execute().map(rows -> {
            JsonObject counts = new JsonObject()
                .put("template", 0)
                .put("human", 0)
                .put("ai", 0);
            rows.forEach(row -> counts.put(row.getString("role"), row.getLong("cnt")));
            return counts;
        });

        Future<JsonObject> guessedRoleFuture = pool.query(SQL_GUESSED_ROLE).execute().map(rows -> {
            JsonObject counts = new JsonObject()
                .put("template", 0)
                .put("human", 0)
                .put("ai", 0);
            rows.forEach(row -> counts.put(row.getString("role"), row.getLong("cnt")));
            return counts;
        });

        return Future.all(overviewFuture, bestRoleFuture, guessedRoleFuture).map(cf ->
            cf.<JsonObject>resultAt(0)
                .put("bestRoleCounts", cf.<JsonObject>resultAt(1))
                .put("guessedAiRoleCounts", cf.<JsonObject>resultAt(2))
        );
    }
}
