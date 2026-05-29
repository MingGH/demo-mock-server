package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 统计侦探排行榜 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class InferenceLeaderboardService {

    private static final String SQL_INSERT =
            "INSERT INTO inference_leaderboard (name, score, rounds, wins, grade, created_at) VALUES (?,?,?,?,?,?)";

    private static final String SQL_TOP =
            "SELECT id, name, score, rounds, wins, grade, created_at FROM inference_leaderboard ORDER BY score DESC, created_at ASC LIMIT ?";

    private static final String SQL_RANK =
            "SELECT COUNT(*) + 1 AS `rank` FROM inference_leaderboard WHERE score > ?";

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM inference_leaderboard";

    private static final String SQL_CLEAR = "DELETE FROM inference_leaderboard";

    private final DatabaseClient db;

    public InferenceLeaderboardService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String name, int score, int rounds, int wins, String grade) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, name).bind(1, score).bind(2, rounds).bind(3, wins).bind(4, grade).bind(5, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_RANK).bind(0, score)
                        .map((row, meta) -> nz(row.get("rank", Long.class))).one())
                .map(rank -> {
                    ObjectNode obj = Json.obj();
                    obj.put("name", name);
                    obj.put("score", score);
                    obj.put("rounds", rounds);
                    obj.put("wins", wins);
                    obj.put("grade", grade);
                    obj.put("rank", rank);
                    return obj;
                });
    }

    public Mono<ObjectNode> top(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        Mono<ArrayNode> leadersMono = db.sql(SQL_TOP).bind(0, safeLimit).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("name", row.get("name", String.class));
            o.put("score", row.get("score", Integer.class));
            o.put("rounds", row.get("rounds", Integer.class));
            o.put("wins", row.get("wins", Integer.class));
            o.put("grade", row.get("grade", String.class));
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

        Mono<Long> totalMono = db.sql(SQL_TOTAL)
                .map((row, meta) -> nz(row.get("total", Long.class))).one();

        return Mono.zip(leadersMono, totalMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("leaders", tuple.getT1());
            result.put("total", tuple.getT2());
            return result;
        });
    }

    public Mono<Void> clear() {
        return db.sql(SQL_CLEAR).fetch().rowsUpdated().then();
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
