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
 * CAPTCHA 攻防实验室 — 业务逻辑层
 * <p>
 * 记录每次挑战结果（8 关通过情况 + 用时），提供全局聚合统计。
 */
public class CaptchaStatsService {

    private static final Logger log = LoggerFactory.getLogger(CaptchaStatsService.class);

    /* ── DDL ── */
    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS captcha_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            passed_count    SMALLINT    NOT NULL,
            total_time_ms   INT         NOT NULL,
            grade           VARCHAR(4)  NOT NULL,
            lv_text         TINYINT     NOT NULL DEFAULT 0,
            lv_math         TINYINT     NOT NULL DEFAULT 0,
            lv_slider       TINYINT     NOT NULL DEFAULT 0,
            lv_grid         TINYINT     NOT NULL DEFAULT 0,
            lv_click        TINYINT     NOT NULL DEFAULT 0,
            lv_rotate       TINYINT     NOT NULL DEFAULT 0,
            lv_spatial      TINYINT     NOT NULL DEFAULT 0,
            lv_behavior     TINYINT     NOT NULL DEFAULT 0,
            time_text       INT         NOT NULL DEFAULT 0,
            time_math       INT         NOT NULL DEFAULT 0,
            time_slider     INT         NOT NULL DEFAULT 0,
            time_grid       INT         NOT NULL DEFAULT 0,
            time_click      INT         NOT NULL DEFAULT 0,
            time_rotate     INT         NOT NULL DEFAULT 0,
            time_spatial    INT         NOT NULL DEFAULT 0,
            time_behavior   INT         NOT NULL DEFAULT 0,
            created_at      BIGINT      NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_grade   (grade)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    /* ── SQL ── */
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

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM captcha_results
        """;

    private final MySQLPool pool;

    public CaptchaStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("captcha_results init failed: {}", ar.cause().getMessage());
            else log.info("captcha_results table ready");
        });
    }

    /**
     * 提交一次挑战结果，返回排名信息
     */
    public Future<JsonObject> submit(JsonObject body) {
        int passedCount = body.getInteger("passedCount");
        int totalTimeMs = body.getInteger("totalTimeMs");
        String grade    = body.getString("grade");
        JsonObject levels = body.getJsonObject("levels");

        long now = Instant.now().toEpochMilli();

        return pool.preparedQuery(SQL_INSERT).execute(Tuple.of(
                passedCount, totalTimeMs, grade,
                levels.getInteger("text", 0),     levels.getInteger("math", 0),
                levels.getInteger("slider", 0),   levels.getInteger("grid", 0),
                levels.getInteger("click", 0),    levels.getInteger("rotate", 0),
                levels.getInteger("spatial", 0),  levels.getInteger("behavior", 0),
                levels.getInteger("timeText", 0),     levels.getInteger("timeMath", 0),
                levels.getInteger("timeSlider", 0),   levels.getInteger("timeGrid", 0),
                levels.getInteger("timeClick", 0),    levels.getInteger("timeRotate", 0),
                levels.getInteger("timeSpatial", 0),  levels.getInteger("timeBehavior", 0),
                now
            ))
            .compose(ignored -> pool.preparedQuery(SQL_RANK)
                .execute(Tuple.of(passedCount, passedCount, totalTimeMs)))
            .compose(rankRows -> {
                long rank = rankRows.iterator().next().getLong("rank");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long totalSessions = totalRows.iterator().next().getLong("total");
                    double percentile = totalSessions > 0
                        ? Math.round((1.0 - (double) rank / totalSessions) * 100)
                        : 50;
                    return new JsonObject()
                        .put("rank", rank)
                        .put("totalSessions", totalSessions)
                        .put("percentile", percentile);
                });
            });
    }

    /**
     * 查询全局聚合统计 + 评级分布
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            JsonObject passRates = new JsonObject()
                .put("text",     row.getDouble("pass_rate_text"))
                .put("math",     row.getDouble("pass_rate_math"))
                .put("slider",   row.getDouble("pass_rate_slider"))
                .put("grid",     row.getDouble("pass_rate_grid"))
                .put("click",    row.getDouble("pass_rate_click"))
                .put("rotate",   row.getDouble("pass_rate_rotate"))
                .put("spatial",  row.getDouble("pass_rate_spatial"))
                .put("behavior", row.getDouble("pass_rate_behavior"));
            JsonObject avgTimes = new JsonObject()
                .put("text",     row.getDouble("avg_time_text"))
                .put("math",     row.getDouble("avg_time_math"))
                .put("slider",   row.getDouble("avg_time_slider"))
                .put("grid",     row.getDouble("avg_time_grid"))
                .put("click",    row.getDouble("avg_time_click"))
                .put("rotate",   row.getDouble("avg_time_rotate"))
                .put("spatial",  row.getDouble("avg_time_spatial"))
                .put("behavior", row.getDouble("avg_time_behavior"));
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgPassed",     row.getDouble("avg_passed"))
                .put("avgTotalSec",   row.getDouble("avg_total_sec"))
                .put("passRates",     passRates)
                .put("avgTimes",      avgTimes);
        });

        Future<JsonObject> gradeFuture = pool.query(SQL_GRADE_DIST).execute().map(rows -> {
            JsonObject dist = new JsonObject();
            rows.forEach(row -> dist.put(row.getString("grade"), row.getLong("cnt")));
            return dist;
        });

        return Future.all(globalFuture, gradeFuture).map(cf ->
            new JsonObject()
                .put("global", cf.<JsonObject>resultAt(0))
                .put("gradeDist", cf.<JsonObject>resultAt(1))
        );
    }
}
