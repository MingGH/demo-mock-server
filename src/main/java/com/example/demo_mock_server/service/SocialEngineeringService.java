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
import java.util.ArrayList;
import java.util.List;

/**
 * 社会工程学防骗挑战 — 业务逻辑层
 */
public class SocialEngineeringService {

    private static final Logger log = LoggerFactory.getLogger(SocialEngineeringService.class);

    private static final String DDL_SESSIONS = """
        CREATE TABLE IF NOT EXISTS se_sessions (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id  VARCHAR(36) NOT NULL,
            total       TINYINT NOT NULL,
            correct     TINYINT NOT NULL,
            all_correct TINYINT(1) NOT NULL DEFAULT 0,
            created_at  BIGINT NOT NULL,
            INDEX idx_session_id (session_id),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String DDL_QUESTIONS = """
        CREATE TABLE IF NOT EXISTS se_question_results (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id  VARCHAR(36) NOT NULL,
            question_id TINYINT NOT NULL,
            tactic      VARCHAR(32) NOT NULL,
            is_fake     TINYINT(1) NOT NULL,
            correct     TINYINT(1) NOT NULL,
            created_at  BIGINT NOT NULL,
            INDEX idx_session_id (session_id),
            INDEX idx_question_id (question_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT_SESSION =
        "INSERT INTO se_sessions (session_id, total, correct, all_correct, created_at) VALUES (?,?,?,?,?)";

    private static final String SQL_INSERT_QUESTION =
        "INSERT INTO se_question_results (session_id, question_id, tactic, is_fake, correct, created_at) VALUES (?,?,?,?,?,?)";

    private static final String SQL_GLOBAL_STATS = """
        SELECT
          COUNT(*)                                    AS total_sessions,
          SUM(all_correct)                            AS perfect_sessions,
          SUM(correct)                                AS total_correct_answers,
          SUM(total - correct)                        AS total_wrong_answers,
          ROUND(AVG(correct * 100.0 / total), 1)      AS avg_score_pct
        FROM se_sessions
        """;

    private static final String SQL_QUESTION_STATS = """
        SELECT
          question_id,
          tactic,
          COUNT(*)        AS attempts,
          SUM(correct)    AS correct_count,
          SUM(1-correct)  AS wrong_count,
          ROUND(SUM(correct) * 100.0 / COUNT(*), 1) AS correct_rate
        FROM se_question_results
        GROUP BY question_id, tactic
        ORDER BY question_id
        """;

    private final MySQLPool pool;

    public SocialEngineeringService(MySQLPool pool) {
        this.pool = pool;
        initTables();
    }

    private void initTables() {
        pool.query(DDL_SESSIONS).execute(ar -> {
            if (ar.failed()) log.error("se_sessions init failed: {}", ar.cause().getMessage());
            else log.info("se_sessions table ready");
        });
        pool.query(DDL_QUESTIONS).execute(ar -> {
            if (ar.failed()) log.error("se_question_results init failed: {}", ar.cause().getMessage());
            else log.info("se_question_results table ready");
        });
    }

    /**
     * 提交一次完整问卷结果
     */
    public Future<JsonObject> submit(SocialEngineeringRecord record) {
        long now = Instant.now().toEpochMilli();
        boolean allCorrect = record.correct() == record.total();

        // 1. 写 session
        Future<Void> sessionFuture = pool.preparedQuery(SQL_INSERT_SESSION)
            .execute(Tuple.of(
                record.sessionId(),
                record.total(),
                record.correct(),
                allCorrect ? 1 : 0,
                now
            ))
            .mapEmpty();

        // 2. 批量写每道题结果
        List<Tuple> questionTuples = new ArrayList<>();
        for (var q : record.questions()) {
            questionTuples.add(Tuple.of(
                record.sessionId(),
                q.questionId(),
                q.tactic(),
                q.isFake() ? 1 : 0,
                q.correct() ? 1 : 0,
                now
            ));
        }

        Future<Void> questionsFuture = pool.preparedQuery(SQL_INSERT_QUESTION)
            .executeBatch(questionTuples)
            .mapEmpty();

        return CompositeFuture.all(sessionFuture, questionsFuture)
            .map(ignored -> new JsonObject().put("ok", true))
            .recover(err -> {
                log.error("submit failed: {}", err.getMessage());
                return Future.failedFuture(err);
            });
    }

    /**
     * 查询全局统计 + 每题统计
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_GLOBAL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("perfectSessions", row.getLong("perfect_sessions"))
                .put("totalCorrectAnswers", row.getLong("total_correct_answers"))
                .put("totalWrongAnswers", row.getLong("total_wrong_answers"))
                .put("avgScorePct", row.getDouble("avg_score_pct"));
        });

        Future<JsonArray> questionFuture = pool.query(SQL_QUESTION_STATS).execute().map(rows -> {
            JsonArray arr = new JsonArray();
            rows.forEach(row -> arr.add(new JsonObject()
                .put("questionId", row.getInteger("question_id"))
                .put("tactic", row.getString("tactic"))
                .put("attempts", row.getLong("attempts"))
                .put("correctCount", row.getLong("correct_count"))
                .put("wrongCount", row.getLong("wrong_count"))
                .put("correctRate", row.getDouble("correct_rate"))
            ));
            return arr;
        });

        return CompositeFuture.all(globalFuture, questionFuture).map(cf ->
            new JsonObject()
                .put("global", cf.<JsonObject>resultAt(0))
                .put("questions", cf.<JsonArray>resultAt(1))
        );
    }
}
