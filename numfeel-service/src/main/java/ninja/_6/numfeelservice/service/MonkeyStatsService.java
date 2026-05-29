package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 无限猴子打字机 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class MonkeyStatsService {

    private static final String SQL_INSERT = """
        INSERT INTO monkey_stats
          (target_text, target_length, total_attempts, total_chars, success, time_elapsed, created_at)
        VALUES (?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total_runs,
          SUM(success) AS total_successes,
          ROUND(SUM(success) / COUNT(*), 3) AS success_rate
        FROM monkey_stats
        """;

    private static final String SQL_LONGEST = """
        SELECT target_text, target_length, total_attempts, total_chars, time_elapsed, success
        FROM monkey_stats
        WHERE success = 1
        ORDER BY target_length DESC, total_attempts ASC
        LIMIT 1
        """;

    private static final String SQL_LEADERBOARD = """
        SELECT target_text, target_length, total_attempts, total_chars, time_elapsed, success
        FROM monkey_stats
        WHERE success = 1
        ORDER BY target_length DESC, total_attempts ASC
        LIMIT 10
        """;

    private final DatabaseClient db;

    public MonkeyStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String targetText, int targetLength, long totalAttempts,
                                   long totalChars, boolean success, int timeElapsed) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, targetText).bind(1, targetLength).bind(2, totalAttempts)
                .bind(3, totalChars).bind(4, success ? 1 : 0).bind(5, timeElapsed).bind(6, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_STATS).map((row, meta) -> {
                    ObjectNode obj = Json.obj();
                    obj.put("totalRuns", nz(row.get("total_runs", Long.class)));
                    obj.put("totalSuccesses", nz(row.get("total_successes", Long.class)));
                    Double rate = row.get("success_rate", Double.class);
                    obj.put("successRate", rate == null ? 0.0 : rate);
                    return obj;
                }).one())
                .flatMap(stats -> db.sql(SQL_LONGEST)
                        .map((row, meta) -> row.get("target_text", String.class))
                        .one()
                        .map(longest -> {
                            stats.put("longestTarget", longest);
                            return stats;
                        })
                        .defaultIfEmpty(stats));
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> statsMono = db.sql(SQL_STATS).map((row, meta) -> {
            long totalRuns = nz(row.get("total_runs", Long.class));
            ObjectNode obj = Json.obj();
            if (totalRuns == 0) {
                obj.put("totalRuns", 0L);
                obj.put("totalSuccesses", 0L);
                obj.put("successRate", 0.0);
            } else {
                obj.put("totalRuns", totalRuns);
                obj.put("totalSuccesses", nz(row.get("total_successes", Long.class)));
                Double rate = row.get("success_rate", Double.class);
                obj.put("successRate", rate == null ? 0.0 : rate);
            }
            return obj;
        }).one();

        Mono<String> longestMono = db.sql(SQL_LONGEST)
                .map((row, meta) -> row.get("target_text", String.class))
                .one()
                .defaultIfEmpty("");

        Mono<ArrayNode> leaderboardMono = db.sql(SQL_LEADERBOARD).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("targetText", row.get("target_text", String.class));
            o.put("targetLength", row.get("target_length", Integer.class));
            o.put("totalAttempts", row.get("total_attempts", Long.class));
            o.put("success", nz(row.get("success", Long.class)) == 1);
            return o;
        }).all().collectList().map(rows -> {
            ArrayNode arr = Json.arr();
            rows.forEach(arr::add);
            return arr;
        });

        return Mono.zip(statsMono, longestMono, leaderboardMono).map(tuple -> {
            ObjectNode result = tuple.getT1();
            String longest = tuple.getT2();
            if (longest != null && !longest.isEmpty()) {
                result.put("longestTarget", longest);
            } else {
                result.putNull("longestTarget");
            }
            result.set("leaderboard", tuple.getT3());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
