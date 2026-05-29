package ninja._6.numfeelservice.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 筑梦师测试 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class InceptionMazeService {

    private static final String SQL_INSERT = """
        INSERT INTO inception_maze_results
          (grid_size, path_length, min_path, detour_ratio, dream_level, wall_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """;

    private static final String SQL_RANK = """
        SELECT COUNT(*) + 1 AS `rank`
        FROM inception_maze_results
        WHERE detour_ratio < ?
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM inception_maze_results";

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

    private final DatabaseClient db;

    public InceptionMazeService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(JsonNode body) {
        int gridSize = Json.getInteger(body, "gridSize");
        int pathLength = Json.getInteger(body, "pathLength");
        int minPath = Json.getInteger(body, "minPath");
        double detourRatio = Json.getDouble(body, "detourRatio");
        int dreamLevel = Json.getInteger(body, "dreamLevel");
        int wallCount = Json.getInteger(body, "wallCount");
        long now = Instant.now().toEpochMilli();

        return db.sql(SQL_INSERT)
                .bind(0, gridSize).bind(1, pathLength).bind(2, minPath)
                .bind(3, detourRatio).bind(4, dreamLevel).bind(5, wallCount).bind(6, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_RANK).bind(0, detourRatio)
                        .map((row, meta) -> nz(row.get("rank", Long.class))).one())
                .flatMap(rank -> db.sql(SQL_TOTAL)
                        .map((row, meta) -> nz(row.get("total", Long.class))).one()
                        .map(total -> {
                            double percentile = total > 1
                                    ? Math.round((1.0 - (double) rank / total) * 100.0) : 50;
                            ObjectNode obj = Json.obj();
                            obj.put("rank", rank);
                            obj.put("total", total);
                            obj.put("percentile", (int) percentile);
                            return obj;
                        }));
    }

    public Mono<ObjectNode> stats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            ObjectNode levelDist = Json.obj();
            levelDist.put("0", nz(row.get("cnt_lv0", Long.class)));
            levelDist.put("1", nz(row.get("cnt_lv1", Long.class)));
            levelDist.put("2", nz(row.get("cnt_lv2", Long.class)));
            levelDist.put("3", nz(row.get("cnt_lv3", Long.class)));
            levelDist.put("4", nz(row.get("cnt_lv4", Long.class)));
            levelDist.put("5", nz(row.get("cnt_lv5", Long.class)));
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("avgDetour", row.get("avg_detour", Double.class));
            obj.put("maxDetour", row.get("max_detour", Double.class));
            obj.put("avgPath", row.get("avg_path", Double.class));
            obj.put("avgWalls", row.get("avg_walls", Double.class));
            obj.set("levelDist", levelDist);
            return obj;
        }).one();
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
