package com.example.demo_mock_server.service;

import io.vertx.core.CompositeFuture;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 会话回放 demo 业务逻辑层
 */
public class SessionReplayService {

    private static final Logger log = LoggerFactory.getLogger(SessionReplayService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS session_replay_sessions (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id      VARCHAR(36) NOT NULL,
            question_count  TINYINT NOT NULL,
            duration_ms     INT NOT NULL,
            event_count     SMALLINT NOT NULL,
            typed_chars     SMALLINT NOT NULL,
            focus_switches  SMALLINT NOT NULL,
            max_scroll_pct  FLOAT NOT NULL,
            answers_json    LONGTEXT NOT NULL,
            events_json     LONGTEXT NOT NULL,
            created_at      BIGINT NOT NULL,
            UNIQUE KEY uk_session_id (session_id),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO session_replay_sessions
          (session_id, question_count, duration_ms, event_count, typed_chars,
           focus_switches, max_scroll_pct, answers_json, events_json, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          question_count = VALUES(question_count),
          duration_ms = VALUES(duration_ms),
          event_count = VALUES(event_count),
          typed_chars = VALUES(typed_chars),
          focus_switches = VALUES(focus_switches),
          max_scroll_pct = VALUES(max_scroll_pct),
          answers_json = VALUES(answers_json),
          events_json = VALUES(events_json)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total_sessions,
          ROUND(AVG(duration_ms), 1) AS avg_duration_ms,
          ROUND(AVG(event_count), 1) AS avg_event_count,
          ROUND(AVG(typed_chars), 1) AS avg_typed_chars,
          ROUND(AVG(focus_switches), 1) AS avg_focus_switches,
          ROUND(AVG(max_scroll_pct), 1) AS avg_max_scroll_pct
        FROM session_replay_sessions
        """;

    private static final String SQL_RECENT = """
        SELECT
          session_id,
          question_count,
          duration_ms,
          event_count,
          typed_chars,
          focus_switches,
          max_scroll_pct,
          created_at
        FROM session_replay_sessions
        ORDER BY created_at DESC
        LIMIT 8
        """;

    private static final String SQL_BY_SESSION =
        "SELECT * FROM session_replay_sessions WHERE session_id = ? LIMIT 1";

    private final MySQLPool pool;

    public SessionReplayService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) {
                log.error("session_replay_sessions init failed: {}", ar.cause().getMessage());
            } else {
                log.info("session_replay_sessions table ready");
            }
        });
    }

    public Future<JsonObject> submit(SessionReplayRecord record) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(
                record.sessionId(),
                record.questionCount(),
                record.durationMs(),
                record.eventCount(),
                record.typedChars(),
                record.focusSwitches(),
                record.maxScrollPct(),
                record.answers().encode(),
                record.events().encode(),
                now
            ))
            .map(rows -> new JsonObject()
                .put("ok", true)
                .put("sessionId", record.sessionId())
            );
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            if (!rows.iterator().hasNext()) {
                return emptyStats();
            }

            var row = rows.iterator().next();
            Long totalSessions = row.getLong("total_sessions");
            if (totalSessions == null || totalSessions == 0) {
                return emptyStats();
            }

            return new JsonObject()
                .put("totalSessions", totalSessions)
                .put("avgDurationMs", safeDouble(row.getDouble("avg_duration_ms")))
                .put("avgEventCount", safeDouble(row.getDouble("avg_event_count")))
                .put("avgTypedChars", safeDouble(row.getDouble("avg_typed_chars")))
                .put("avgFocusSwitches", safeDouble(row.getDouble("avg_focus_switches")))
                .put("avgMaxScrollPct", safeDouble(row.getDouble("avg_max_scroll_pct")));
        });

        Future<JsonArray> recentFuture = pool.query(SQL_RECENT).execute().map(rows -> {
            JsonArray recent = new JsonArray();
            rows.forEach(row -> recent.add(new JsonObject()
                .put("sessionId", row.getString("session_id"))
                .put("questionCount", row.getInteger("question_count"))
                .put("durationMs", row.getInteger("duration_ms"))
                .put("eventCount", row.getInteger("event_count"))
                .put("typedChars", row.getInteger("typed_chars"))
                .put("focusSwitches", row.getInteger("focus_switches"))
                .put("maxScrollPct", safeDouble(row.getDouble("max_scroll_pct")))
                .put("createdAt", row.getLong("created_at"))
            ));
            return recent;
        });

        return CompositeFuture.all(globalFuture, recentFuture).map(cf -> new JsonObject()
            .put("global", cf.resultAt(0))
            .put("recent", cf.resultAt(1))
        );
    }

    public Future<JsonObject> getSession(String sessionId) {
        return pool.preparedQuery(SQL_BY_SESSION)
            .execute(Tuple.of(sessionId))
            .compose(rows -> {
                if (!rows.iterator().hasNext()) {
                    return Future.failedFuture("NOT_FOUND");
                }

                var row = rows.iterator().next();
                return Future.succeededFuture(new JsonObject()
                    .put("sessionId", row.getString("session_id"))
                    .put("questionCount", row.getInteger("question_count"))
                    .put("durationMs", row.getInteger("duration_ms"))
                    .put("eventCount", row.getInteger("event_count"))
                    .put("typedChars", row.getInteger("typed_chars"))
                    .put("focusSwitches", row.getInteger("focus_switches"))
                    .put("maxScrollPct", safeDouble(row.getDouble("max_scroll_pct")))
                    .put("createdAt", row.getLong("created_at"))
                    .put("answers", safeObject(row.getString("answers_json")))
                    .put("events", safeArray(row.getString("events_json")))
                );
            });
    }

    private JsonObject emptyStats() {
        return new JsonObject()
            .put("totalSessions", 0)
            .put("avgDurationMs", 0)
            .put("avgEventCount", 0)
            .put("avgTypedChars", 0)
            .put("avgFocusSwitches", 0)
            .put("avgMaxScrollPct", 0);
    }

    private double safeDouble(Double value) {
        if (value == null) {
            return 0;
        }
        return Math.round(value * 10.0) / 10.0;
    }

    private JsonObject safeObject(String value) {
        try {
            return value == null || value.isBlank() ? new JsonObject() : new JsonObject(value);
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    private JsonArray safeArray(String value) {
        try {
            return value == null || value.isBlank() ? new JsonArray() : new JsonArray(value);
        } catch (Exception e) {
            return new JsonArray();
        }
    }
}
