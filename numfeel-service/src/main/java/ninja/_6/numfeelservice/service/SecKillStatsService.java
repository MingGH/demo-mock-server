package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 秒杀抢票模拟器 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class SecKillStatsService {

    private static final String SQL_INSERT = """
        INSERT INTO seckill_stats
          (participants, stock, user_won, user_rank, user_latency, latency_gap, created_at)
        VALUES (?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total_runs,
          SUM(user_won) AS total_wins,
          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
        FROM seckill_stats
        """;

    private static final String SQL_SCENARIO_STATS = """
        SELECT participants, stock,
          COUNT(*) AS cnt,
          SUM(user_won) AS wins,
          ROUND(SUM(user_won) / COUNT(*), 3) AS win_rate
        FROM seckill_stats
        GROUP BY participants, stock
        ORDER BY cnt DESC
        LIMIT 10
        """;

    private final DatabaseClient db;

    public SecKillStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(int participants, int stock, boolean userWon,
                                   int userRank, double userLatency, double latencyGap) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, participants).bind(1, stock).bind(2, userWon ? 1 : 0)
                .bind(3, userRank).bind(4, userLatency).bind(5, latencyGap).bind(6, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_STATS).map((row, meta) -> {
                    ObjectNode obj = Json.obj();
                    obj.put("totalRuns", nz(row.get("total_runs", Long.class)));
                    obj.put("totalWins", nz(row.get("total_wins", Long.class)));
                    Double winRate = row.get("win_rate", Double.class);
                    obj.put("winRate", winRate == null ? 0.0 : winRate);
                    return obj;
                }).one());
    }

    public Mono<ObjectNode> stats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            long totalRuns = nz(row.get("total_runs", Long.class));
            ObjectNode global = Json.obj();
            global.put("totalRuns", totalRuns);
            if (totalRuns == 0) {
                global.put("totalWins", 0L);
                global.put("winRate", 0.0);
            } else {
                global.put("totalWins", nz(row.get("total_wins", Long.class)));
                Double winRate = row.get("win_rate", Double.class);
                global.put("winRate", winRate == null ? 0.0 : winRate);
            }
            return global;
        }).one().flatMap(global -> {
            if (global.get("totalRuns").asLong() == 0) {
                global.set("byScenario", Json.arr());
                return Mono.just(global);
            }
            return db.sql(SQL_SCENARIO_STATS).map((row, meta) -> {
                ObjectNode o = Json.obj();
                o.put("participants", row.get("participants", Integer.class));
                o.put("stock", row.get("stock", Integer.class));
                o.put("count", nz(row.get("cnt", Long.class)));
                o.put("wins", nz(row.get("wins", Long.class)));
                o.put("winRate", row.get("win_rate", Double.class));
                return o;
            }).all().collectList().map(rows -> {
                ArrayNode arr = Json.arr();
                rows.forEach(arr::add);
                global.set("byScenario", arr);
                return global;
            });
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
