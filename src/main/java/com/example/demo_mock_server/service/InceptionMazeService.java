package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 筑梦师测试 — 业务逻辑层
 * <p>
 * 记录每次测试结果（绕路倍数、路径长度、网格大小、等级），
 * 提供全局聚合统计和百分位排名。
 */
public class InceptionMazeService {

    private static final Logger log = LoggerFactory.getLogger(InceptionMazeService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS inception_maze_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            grid_size       TINYINT     NOT NULL,
            path_length     SMALLINT    NOT NULL,
            min_path        SMALLINT    NOT NULL,
            detour_ratio    FLOAT       NOT NULL,
            dream_level     TINYINT     NOT NULL,
            wall_count      SMALLINT    NOT NULL,
            created_at      BIGINT      NOT NULL,
            INDEX idx_created     (created_at),
            INDEX idx_level       (dream_level),
            INDEX idx_detour      (detour_ratio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO inception_maze_results
          (grid_size, path_length, min_path, detour_ratio, dream_level, wall_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """;

    // 比当前得分低的人数 + 1 = 排名
    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM inception_maze_results
        WHERE detour_ratio < ?
        """;

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM inception_maze_results
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                              AS total_sessions,
          ROUND(AVG(detour_ratio), 2)           AS avg_detour,
          ROUND(MAX(detour_ratio), 2)           AS max_detour,
          ROUND(AVG(path_length), 1)            AS avg_path,
          ROUND(AVG(wall_count), 1)             AS avg_walls,
          SUM(dream_level = 0)                  AS cnt_lv0,
          SUM(dream_level = 1)                  AS cnt_lv1,
          SUM(dream_level = 2)                  AS cnt_lv2,
          SUM(dream_level = 3)                  AS cnt_lv3,
          SUM(dream_level = 4)                  AS cnt_lv4,
          SUM(dream_level = 5)                  AS cnt_lv5
        FROM inception_maze_results
        """;

    private final MySQLPool pool;

    public InceptionMazeService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("inception_maze_results init failed: {}", ar.cause().getMessage());
            else log.info("inception_maze_results table ready");
        });
    }

    /**
     * 提交一次测试结果，返回排名和百分位
     */
    public Future<JsonObject> submit(JsonObject body) {
        int    gridSize    = body.getInteger("gridSize");
        int    pathLength  = body.getInteger("pathLength");
        int    minPath     = body.getInteger("minPath");
        double detourRatio = body.getDouble("detourRatio");
        int    dreamLevel  = body.getInteger("dreamLevel");
        int    wallCount   = body.getInteger("wallCount");
        long   now         = Instant.now().toEpochMilli();

        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(gridSize, pathLength, minPath, detourRatio, dreamLevel, wallCount, now))
            .compose(ignored -> pool.preparedQuery(SQL_RANK).execute(Tuple.of(detourRatio)))
            .compose(rankRows -> {
                long rank = rankRows.iterator().next().getLong("rank");
                return pool.query(SQL_TOTAL).execute().map(totalRows -> {
                    long total = totalRows.iterator().next().getLong("total");
                    // 百分位：比你低的人占比
                    double percentile = total > 1
                        ? Math.round((1.0 - (double) rank / total) * 100.0)
                        : 50;
                    return new JsonObject()
                        .put("rank", rank)
                        .put("total", total)
                        .put("percentile", (int) percentile);
                });
            });
    }

    /**
     * 全局统计
     */
    public Future<JsonObject> stats() {
        return pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            return new JsonObject()
                .put("totalSessions", row.getLong("total_sessions"))
                .put("avgDetour",     row.getDouble("avg_detour"))
                .put("maxDetour",     row.getDouble("max_detour"))
                .put("avgPath",       row.getDouble("avg_path"))
                .put("avgWalls",      row.getDouble("avg_walls"))
                .put("levelDist", new JsonObject()
                    .put("0", row.getLong("cnt_lv0"))
                    .put("1", row.getLong("cnt_lv1"))
                    .put("2", row.getLong("cnt_lv2"))
                    .put("3", row.getLong("cnt_lv3"))
                    .put("4", row.getLong("cnt_lv4"))
                    .put("5", row.getLong("cnt_lv5")));
        });
    }
}
