package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 级联故障模拟器 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class CascadeFailureService {

    private static final String SQL_INSERT = """
        INSERT INTO cascade_failure_results
          (topology, coupling, capacity, strategy, trigger_pos,
           survival_rate, cascade_steps, max_component, total_nodes, score, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                   AS total_runs,
          ROUND(AVG(survival_rate), 3)               AS avg_survival,
          ROUND(AVG(cascade_steps), 1)               AS avg_steps,
          ROUND(AVG(score), 1)                       AS avg_score,
          ROUND(SUM(CASE WHEN survival_rate >= 0.8 THEN 1 ELSE 0 END) / COUNT(*), 3) AS high_survival_rate
        FROM cascade_failure_results
        """;

    private static final String SQL_TOPO_STATS = """
        SELECT topology,
          COUNT(*)                                   AS cnt,
          ROUND(AVG(survival_rate), 3)               AS avg_survival
        FROM cascade_failure_results
        GROUP BY topology
        ORDER BY cnt DESC
        """;

    private static final String SQL_LEADERBOARD = """
        SELECT topology, strategy, survival_rate, cascade_steps, score, created_at
        FROM cascade_failure_results
        ORDER BY score DESC, survival_rate DESC
        LIMIT ?
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM cascade_failure_results";

    private final DatabaseClient db;

    public CascadeFailureService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String topology, int coupling, int capacity, String strategy,
                                   String triggerPos, double survivalRate, int cascadeSteps,
                                   int maxComponent, int totalNodes, int score) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, topology).bind(1, coupling).bind(2, capacity).bind(3, strategy)
                .bind(4, triggerPos).bind(5, survivalRate).bind(6, cascadeSteps)
                .bind(7, maxComponent).bind(8, totalNodes).bind(9, score).bind(10, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_TOTAL).map((row, meta) -> nz(row.get("total", Long.class))).one())
                .map(total -> {
                    ObjectNode obj = Json.obj();
                    obj.put("totalRuns", total);
                    obj.put("yourScore", score);
                    return obj;
                });
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_STATS).map((row, meta) -> {
            long totalRuns = nz(row.get("total_runs", Long.class));
            ObjectNode global = Json.obj();
            global.put("totalRuns", totalRuns);
            if (totalRuns == 0) {
                global.put("avgSurvival", 0.0);
                global.put("avgSteps", 0.0);
                global.put("avgScore", 0.0);
                global.put("highSurvivalRate", 0.0);
            } else {
                global.put("avgSurvival", row.get("avg_survival", Double.class));
                global.put("avgSteps", row.get("avg_steps", Double.class));
                global.put("avgScore", row.get("avg_score", Double.class));
                global.put("highSurvivalRate", row.get("high_survival_rate", Double.class));
            }
            return global;
        }).one();

        Mono<ArrayNode> topoMono = db.sql(SQL_TOPO_STATS).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("topology", row.get("topology", String.class));
            o.put("count", nz(row.get("cnt", Long.class)));
            o.put("avgSurvival", row.get("avg_survival", Double.class));
            return o;
        }).all().collectList().map(rows -> {
            ArrayNode arr = Json.arr();
            rows.forEach(arr::add);
            return arr;
        });

        return Mono.zip(globalMono, topoMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("global", tuple.getT1());
            result.set("byTopology", tuple.getT2());
            return result;
        });
    }

    public Mono<ObjectNode> leaderboard(int limit) {
        Mono<ArrayNode> listMono = db.sql(SQL_LEADERBOARD).bind(0, limit).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("topology", row.get("topology", String.class));
            o.put("strategy", row.get("strategy", String.class));
            o.put("survivalRate", row.get("survival_rate", Double.class));
            o.put("cascadeSteps", row.get("cascade_steps", Integer.class));
            o.put("score", row.get("score", Integer.class));
            o.put("time", row.get("created_at", Long.class));
            return o;
        }).all().collectList().map(rows -> {
            ArrayNode arr = Json.arr();
            int rank = 1;
            for (ObjectNode o : rows) {
                o.put("rank", rank++);
                arr.add(o);
            }
            return arr;
        });

        Mono<Long> totalMono = db.sql(SQL_TOTAL).map((row, meta) -> nz(row.get("total", Long.class))).one();

        return Mono.zip(listMono, totalMono).map(tuple -> {
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
