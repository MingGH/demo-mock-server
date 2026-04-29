package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public class TimePerceptionService {

    private static final Logger log = LoggerFactory.getLogger(TimePerceptionService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS time_perception_results (
            id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
            player_name             VARCHAR(24)  NOT NULL,
            total_score             SMALLINT     NOT NULL,
            weber_score             DOUBLE       NOT NULL,
            avg_abs_distortion      DOUBLE       NOT NULL,
            blank_avg_distortion    DOUBLE       NOT NULL,
            load_avg_distortion     DOUBLE       NOT NULL,
            emotion_avg_distortion  DOUBLE       NOT NULL,
            bias_direction          VARCHAR(16)  NOT NULL,
            grade                   VARCHAR(16)  NOT NULL,
            created_at              BIGINT       NOT NULL,
            INDEX idx_created (created_at),
            INDEX idx_score   (total_score),
            INDEX idx_grade   (grade)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

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

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM time_perception_results
        """;

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

    private final MySQLPool pool;

    public TimePerceptionService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("time_perception_results init failed: {}", ar.cause().getMessage());
            else log.info("time_perception_results table ready");
        });
    }

    public Future<JsonObject> submit(String playerName, int totalScore, double weberScore,
                                     double avgAbsDistortion,
                                     double blankAvgDistortion, double loadAvgDistortion,
                                     double emotionAvgDistortion, String biasDirection, String grade) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(playerName, totalScore, weberScore, avgAbsDistortion,
                blankAvgDistortion, loadAvgDistortion, emotionAvgDistortion,
                biasDirection, grade, now))
            .compose(ignored -> pool.preparedQuery(SQL_RANK).execute(Tuple.of(totalScore)))
            .compose(rankRows -> {
                long rank = rankRows.iterator().next().getLong("rank");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long totalSessions = totalRows.iterator().next().getLong("total");
                    return new JsonObject()
                        .put("rank", rank)
                        .put("totalSessions", totalSessions);
                });
            });
    }

    public Future<JsonObject> stats() {
        Future<JsonObject> globalFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgScore", row.getDouble("avg_score"))
                .put("avgAbsDistortion", row.getDouble("avg_abs_distortion"))
                .put("avgWeber", row.getDouble("avg_weber"))
                .put("avgBlankDist", row.getDouble("avg_blank_dist"))
                .put("avgLoadDist", row.getDouble("avg_load_dist"))
                .put("avgEmotionDist", row.getDouble("avg_emotion_dist"))
                .put("overRatio", row.getDouble("over_ratio"))
                .put("underRatio", row.getDouble("under_ratio"));
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

    public Future<JsonObject> leaderboard(int limit) {
        return pool.preparedQuery(SQL_LEADERBOARD).execute(Tuple.of(limit))
            .compose(rows -> pool.preparedQuery("SELECT COUNT(*) AS total FROM time_perception_results")
                .execute()
                .map(totalRows -> {
                    long total = totalRows.iterator().next().getLong("total");
                    var leaders = new io.vertx.core.json.JsonArray();
                    rows.forEach(row -> leaders.add(new JsonObject()
                        .put("rank", row.getLong("rank"))
                        .put("name", row.getString("player_name"))
                        .put("score", row.getInteger("total_score"))
                        .put("grade", row.getString("grade"))
                        .put("weber", row.getDouble("weber_score"))
                    ));
                    return new JsonObject()
                        .put("leaders", leaders)
                        .put("total", total);
                }));
    }
}
