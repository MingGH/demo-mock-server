package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 社会工程学防骗挑战 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class SocialEngineeringService {

    private static final Logger log = LoggerFactory.getLogger(SocialEngineeringService.class);

    private static final String SQL_INSERT_SESSION =
            "INSERT INTO se_sessions (session_id, total, correct, all_correct, created_at) VALUES (?,?,?,?,?)";

    private static final String SQL_INSERT_QUESTION =
            "INSERT INTO se_question_results (session_id, question_id, tactic, is_fake, correct, created_at) VALUES (?,?,?,?,?,?)";

    private static final String SQL_GLOBAL_STATS = """
        SELECT
          COUNT(*)                                         AS total_sessions,
          COALESCE(SUM(all_correct), 0)                   AS perfect_sessions,
          COALESCE(SUM(correct), 0)                       AS total_correct_answers,
          COALESCE(SUM(total - correct), 0)               AS total_wrong_answers,
          ROUND(AVG(correct * 100.0 / total), 1)          AS avg_score_pct
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

    private final DatabaseClient db;

    public SocialEngineeringService(DatabaseClient db) {
        this.db = db;
    }

    /** 提交一次完整问卷结果。 */
    public Mono<ObjectNode> submit(SocialEngineeringRecord record) {
        long now = Instant.now().toEpochMilli();
        boolean allCorrect = record.correct() == record.total();

        Mono<Long> sessionMono = db.sql(SQL_INSERT_SESSION)
                .bind(0, record.sessionId())
                .bind(1, record.total())
                .bind(2, record.correct())
                .bind(3, allCorrect ? 1 : 0)
                .bind(4, now)
                .fetch().rowsUpdated();

        Mono<Void> questionsMono = Flux.fromIterable(record.questions())
                .concatMap(q -> db.sql(SQL_INSERT_QUESTION)
                        .bind(0, record.sessionId())
                        .bind(1, q.questionId())
                        .bind(2, q.tactic())
                        .bind(3, q.isFake() ? 1 : 0)
                        .bind(4, q.correct() ? 1 : 0)
                        .bind(5, now)
                        .fetch().rowsUpdated())
                .then();

        return sessionMono.then(questionsMono)
                .thenReturn(Json.obj().put("ok", true))
                .onErrorResume(err -> {
                    log.error("submit failed: {}", err.getMessage());
                    return Mono.error(err);
                });
    }

    /** 查询全局统计 + 每题统计。 */
    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_GLOBAL_STATS).map((row, meta) -> {
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("perfectSessions", nzNum(row.get("perfect_sessions", Number.class)));
            obj.put("totalCorrectAnswers", nzNum(row.get("total_correct_answers", Number.class)));
            obj.put("totalWrongAnswers", nzNum(row.get("total_wrong_answers", Number.class)));
            obj.put("avgScorePct", row.get("avg_score_pct", Double.class));
            return obj;
        }).one();

        Mono<ArrayNode> questionMono = db.sql(SQL_QUESTION_STATS).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("questionId", row.get("question_id", Integer.class));
            o.put("tactic", row.get("tactic", String.class));
            o.put("attempts", nz(row.get("attempts", Long.class)));
            o.put("correctCount", nzNum(row.get("correct_count", Number.class)));
            o.put("wrongCount", nzNum(row.get("wrong_count", Number.class)));
            o.put("correctRate", row.get("correct_rate", Double.class));
            return o;
        }).all().collectList().map(rows -> {
            ArrayNode arr = Json.arr();
            rows.forEach(arr::add);
            return arr;
        });

        return Mono.zip(globalMono, questionMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("global", tuple.getT1());
            result.set("questions", tuple.getT2());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    private static long nzNum(Number v) {
        return v == null ? 0L : v.longValue();
    }
}
