package ninja._6.numfeelservice.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * CAPTCHA 攻防实验室 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class CaptchaStatsService {

    private static final String SQL_INSERT = """
        INSERT INTO captcha_results
          (passed_count, total_time_ms, grade,
           lv_text, lv_math, lv_slider, lv_grid, lv_click, lv_rotate, lv_spatial, lv_behavior,
           time_text, time_math, time_slider, time_grid, time_click, time_rotate, time_spatial, time_behavior,
           created_at)
        VALUES (?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                              AS total_sessions,
          ROUND(AVG(passed_count), 2)           AS avg_passed,
          ROUND(AVG(total_time_ms) / 1000, 1)   AS avg_total_sec,
          ROUND(AVG(lv_text)   * 100, 1)        AS pass_rate_text,
          ROUND(AVG(lv_math)   * 100, 1)        AS pass_rate_math,
          ROUND(AVG(lv_slider) * 100, 1)        AS pass_rate_slider,
          ROUND(AVG(lv_grid)   * 100, 1)        AS pass_rate_grid,
          ROUND(AVG(lv_click)  * 100, 1)        AS pass_rate_click,
          ROUND(AVG(lv_rotate) * 100, 1)        AS pass_rate_rotate,
          ROUND(AVG(lv_spatial)* 100, 1)        AS pass_rate_spatial,
          ROUND(AVG(lv_behavior)*100, 1)        AS pass_rate_behavior,
          ROUND(AVG(time_text)   / 1000, 1)     AS avg_time_text,
          ROUND(AVG(time_math)   / 1000, 1)     AS avg_time_math,
          ROUND(AVG(time_slider) / 1000, 1)     AS avg_time_slider,
          ROUND(AVG(time_grid)   / 1000, 1)     AS avg_time_grid,
          ROUND(AVG(time_click)  / 1000, 1)     AS avg_time_click,
          ROUND(AVG(time_rotate) / 1000, 1)     AS avg_time_rotate,
          ROUND(AVG(time_spatial)/ 1000, 1)     AS avg_time_spatial,
          ROUND(AVG(time_behavior)/1000, 1)     AS avg_time_behavior
        FROM captcha_results
        """;

    private static final String SQL_GRADE_DIST = """
        SELECT grade, COUNT(*) AS cnt
        FROM captcha_results
        GROUP BY grade
        ORDER BY cnt DESC
        """;

    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM captcha_results
        WHERE passed_count > ?
           OR (passed_count = ? AND total_time_ms < ?)
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM captcha_results";

    private final DatabaseClient db;

    public CaptchaStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(JsonNode body) {
        int passedCount = Json.getInteger(body, "passedCount");
        int totalTimeMs = Json.getInteger(body, "totalTimeMs");
        String grade = Json.getString(body, "grade");
        JsonNode levels = Json.getObject(body, "levels");
        long now = Instant.now().toEpochMilli();

        return db.sql(SQL_INSERT)
                .bind(0, passedCount).bind(1, totalTimeMs).bind(2, grade)
                .bind(3, Json.getInteger(levels, "text", 0)).bind(4, Json.getInteger(levels, "math", 0))
                .bind(5, Json.getInteger(levels, "slider", 0)).bind(6, Json.getInteger(levels, "grid", 0))
                .bind(7, Json.getInteger(levels, "click", 0)).bind(8, Json.getInteger(levels, "rotate", 0))
                .bind(9, Json.getInteger(levels, "spatial", 0)).bind(10, Json.getInteger(levels, "behavior", 0))
                .bind(11, Json.getInteger(levels, "timeText", 0)).bind(12, Json.getInteger(levels, "timeMath", 0))
                .bind(13, Json.getInteger(levels, "timeSlider", 0)).bind(14, Json.getInteger(levels, "timeGrid", 0))
                .bind(15, Json.getInteger(levels, "timeClick", 0)).bind(16, Json.getInteger(levels, "timeRotate", 0))
                .bind(17, Json.getInteger(levels, "timeSpatial", 0)).bind(18, Json.getInteger(levels, "timeBehavior", 0))
                .bind(19, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_RANK).bind(0, passedCount).bind(1, passedCount).bind(2, totalTimeMs)
                        .map((row, meta) -> nz(row.get("rank", Long.class))).one())
                .flatMap(rank -> db.sql(SQL_TOTAL)
                        .map((row, meta) -> nz(row.get("total", Long.class))).one()
                        .map(totalSessions -> {
                            double percentile = totalSessions > 0
                                    ? Math.round((1.0 - (double) rank / totalSessions) * 100) : 50;
                            ObjectNode obj = Json.obj();
                            obj.put("rank", rank);
                            obj.put("totalSessions", totalSessions);
                            obj.put("percentile", percentile);
                            return obj;
                        }));
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_STATS).map((row, meta) -> {
            ObjectNode passRates = Json.obj();
            passRates.put("text", row.get("pass_rate_text", Double.class));
            passRates.put("math", row.get("pass_rate_math", Double.class));
            passRates.put("slider", row.get("pass_rate_slider", Double.class));
            passRates.put("grid", row.get("pass_rate_grid", Double.class));
            passRates.put("click", row.get("pass_rate_click", Double.class));
            passRates.put("rotate", row.get("pass_rate_rotate", Double.class));
            passRates.put("spatial", row.get("pass_rate_spatial", Double.class));
            passRates.put("behavior", row.get("pass_rate_behavior", Double.class));
            ObjectNode avgTimes = Json.obj();
            avgTimes.put("text", row.get("avg_time_text", Double.class));
            avgTimes.put("math", row.get("avg_time_math", Double.class));
            avgTimes.put("slider", row.get("avg_time_slider", Double.class));
            avgTimes.put("grid", row.get("avg_time_grid", Double.class));
            avgTimes.put("click", row.get("avg_time_click", Double.class));
            avgTimes.put("rotate", row.get("avg_time_rotate", Double.class));
            avgTimes.put("spatial", row.get("avg_time_spatial", Double.class));
            avgTimes.put("behavior", row.get("avg_time_behavior", Double.class));
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("avgPassed", row.get("avg_passed", Double.class));
            obj.put("avgTotalSec", row.get("avg_total_sec", Double.class));
            obj.set("passRates", passRates);
            obj.set("avgTimes", avgTimes);
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

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
