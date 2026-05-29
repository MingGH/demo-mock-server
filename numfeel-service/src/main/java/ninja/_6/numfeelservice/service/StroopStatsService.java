package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 斯特鲁普效应挑战 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class StroopStatsService {

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

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM stroop_results";

    private final DatabaseClient db;

    public StroopStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(int total, int correctCount, double accuracy,
                                   double avgRT, double conAvgRT, double incAvgRT,
                                   double stroopEffect, String grade) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, total).bind(1, correctCount).bind(2, accuracy)
                .bind(3, avgRT).bind(4, conAvgRT).bind(5, incAvgRT)
                .bind(6, stroopEffect).bind(7, grade).bind(8, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_RANK).bind(0, stroopEffect)
                        .map((row, meta) -> row.get("rank", Long.class)).one())
                .flatMap(rank -> db.sql(SQL_TOTAL)
                        .map((row, meta) -> row.get("total", Long.class)).one()
                        .map(totalSessions -> {
                            ObjectNode obj = Json.obj();
                            obj.put("rank", rank);
                            obj.put("totalSessions", totalSessions);
                            obj.put("percentile", totalSessions > 0
                                    ? Math.round((1.0 - (double) rank / totalSessions) * 100) : 0);
                            return obj;
                        }));
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_STATS).map((row, meta) -> {
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("avgStroopEffect", row.get("avg_stroop_effect", Double.class));
            obj.put("avgRT", row.get("avg_rt", Double.class));
            obj.put("avgAccuracyPct", row.get("avg_accuracy_pct", Double.class));
            obj.put("minStroopEffect", row.get("min_stroop_effect", Double.class));
            obj.put("maxStroopEffect", row.get("max_stroop_effect", Double.class));
            obj.put("avgConRT", row.get("avg_con_rt", Double.class));
            obj.put("avgIncRT", row.get("avg_inc_rt", Double.class));
            return obj;
        }).one();

        Mono<ObjectNode> gradeMono = db.sql(SQL_GRADE_DIST)
                .map((row, meta) -> new String[]{row.get("grade", String.class),
                        String.valueOf(nz(row.get("cnt", Long.class)))})
                .all()
                .collectList()
                .map(rows -> {
                    ObjectNode dist = Json.obj();
                    for (String[] r : rows) {
                        dist.put(r[0], Long.parseLong(r[1]));
                    }
                    return dist;
                });

        return Mono.zip(globalMono, gradeMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("global", tuple.getT1());
            result.set("gradeDist", tuple.getT2());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
