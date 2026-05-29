package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 时间感知扭曲实验室 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class TimePerceptionService {

    private static final String SQL_INSERT = """
        INSERT INTO time_perception_results
          (player_name, total_score, weber_score, avg_abs_distortion,
           blank_avg_distortion, load_avg_distortion, emotion_avg_distortion,
           bias_direction, grade, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM time_perception_results
        WHERE total_score > ?
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM time_perception_results";

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                  AS total_sessions,
          ROUND(AVG(total_score), 1)                AS avg_score,
          ROUND(AVG(avg_abs_distortion), 4)         AS avg_abs_distortion,
          ROUND(AVG(weber_score), 4)                AS avg_weber,
          ROUND(AVG(blank_avg_distortion), 4)       AS avg_blank_dist,
          ROUND(AVG(load_avg_distortion), 4)        AS avg_load_dist,
          ROUND(AVG(emotion_avg_distortion), 4)     AS avg_emotion_dist,
          ROUND(SUM(CASE WHEN bias_direction = 'overestimator' THEN 1 ELSE 0 END) / COUNT(*), 3) AS over_ratio,
          ROUND(SUM(CASE WHEN bias_direction = 'underestimator' THEN 1 ELSE 0 END) / COUNT(*), 3) AS under_ratio
        FROM time_perception_results
        """;

    private static final String SQL_GRADE_DIST = """
        SELECT grade, COUNT(*) AS cnt
        FROM time_perception_results
        GROUP BY grade
        ORDER BY cnt DESC
        """;

    private static final String SQL_LEADERBOARD = """
        SELECT player_name, total_score, grade, weber_score,
               RANK() OVER (ORDER BY total_score DESC) AS `rank`
        FROM time_perception_results
        ORDER BY total_score DESC
        LIMIT ?
        """;

    private final DatabaseClient db;

    public TimePerceptionService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String playerName, int totalScore, double weberScore,
                                   double avgAbsDistortion,
                                   double blankAvgDistortion, double loadAvgDistortion,
                                   double emotionAvgDistortion, String biasDirection, String grade) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, playerName).bind(1, totalScore).bind(2, weberScore).bind(3, avgAbsDistortion)
                .bind(4, blankAvgDistortion).bind(5, loadAvgDistortion).bind(6, emotionAvgDistortion)
                .bind(7, biasDirection).bind(8, grade).bind(9, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_RANK).bind(0, totalScore)
                        .map((row, meta) -> nz(row.get("rank", Long.class))).one())
                .flatMap(rank -> db.sql(SQL_TOTAL)
                        .map((row, meta) -> nz(row.get("total", Long.class))).one()
                        .map(totalSessions -> {
                            ObjectNode obj = Json.obj();
                            obj.put("rank", rank);
                            obj.put("totalSessions", totalSessions);
                            return obj;
                        }));
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_STATS).map((row, meta) -> {
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("avgScore", row.get("avg_score", Double.class));
            obj.put("avgAbsDistortion", row.get("avg_abs_distortion", Double.class));
            obj.put("avgWeber", row.get("avg_weber", Double.class));
            obj.put("avgBlankDist", row.get("avg_blank_dist", Double.class));
            obj.put("avgLoadDist", row.get("avg_load_dist", Double.class));
            obj.put("avgEmotionDist", row.get("avg_emotion_dist", Double.class));
            obj.put("overRatio", row.get("over_ratio", Double.class));
            obj.put("underRatio", row.get("under_ratio", Double.class));
            return obj;
        }).one();

        Mono<ObjectNode> gradeMono = db.sql(SQL_GRADE_DIST).map((row, meta) ->
                new Object[]{row.get("grade", String.class), nz(row.get("cnt", Long.class))}
        ).all().collectList().map(rows -> {
            ObjectNode dist = Json.obj();
            for (Object[] r : rows) {
                dist.put((String) r[0], (Long) r[1]);
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

    public Mono<ObjectNode> leaderboard(int limit) {
        Mono<ArrayNode> leadersMono = db.sql(SQL_LEADERBOARD).bind(0, limit).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("rank", row.get("rank", Long.class));
            o.put("name", row.get("player_name", String.class));
            o.put("score", row.get("total_score", Integer.class));
            o.put("grade", row.get("grade", String.class));
            o.put("weber", row.get("weber_score", Double.class));
            return o;
        }).all().collectList().map(rows -> {
            ArrayNode arr = Json.arr();
            rows.forEach(arr::add);
            return arr;
        });

        Mono<Long> totalMono = db.sql(SQL_TOTAL)
                .map((row, meta) -> nz(row.get("total", Long.class))).one();

        return Mono.zip(leadersMono, totalMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("leaders", tuple.getT1());
            result.put("total", tuple.getT2());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
