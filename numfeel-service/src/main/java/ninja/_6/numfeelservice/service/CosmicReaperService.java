package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 宇宙收割者假说 — 数据服务（R2DBC 重写）。
 */
@Service
public class CosmicReaperService {

    private static final String SQL_INSERT = """
        INSERT INTO cosmic_reaper_results
          (strategy, `escaped`, turns, score, final_tech, final_signal, final_stealth, created_at)
        VALUES (?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT
          COUNT(*)                                                    AS total_runs,
          ROUND(SUM(CASE WHEN `escaped` = 1 THEN 1 ELSE 0 END) * 100.0 / GREATEST(COUNT(*), 1), 1) AS escape_rate,
          ROUND(AVG(score), 1)                                       AS avg_score,
          ROUND(AVG(turns), 1)                                       AS avg_turns
        FROM cosmic_reaper_results
        """;

    private static final String SQL_TOP_STRATEGY = """
        SELECT strategy, COUNT(*) AS cnt
        FROM cosmic_reaper_results
        GROUP BY strategy
        ORDER BY cnt DESC
        LIMIT 1
        """;

    private final DatabaseClient db;

    public CosmicReaperService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String strategy, boolean escaped, int turns, int score,
                                   int finalTech, int finalSignal, int finalStealth) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, strategy).bind(1, escaped ? 1 : 0).bind(2, turns).bind(3, score)
                .bind(4, finalTech).bind(5, finalSignal).bind(6, finalStealth).bind(7, now)
                .fetch().rowsUpdated()
                .then(getStats());
    }

    public Mono<ObjectNode> getStats() {
        Mono<ObjectNode> globalMono = db.sql(SQL_STATS).map((row, meta) -> {
            long totalRuns = nz(row.get("total_runs", Long.class));
            ObjectNode obj = Json.obj();
            obj.put("totalRuns", totalRuns);
            if (totalRuns == 0) {
                obj.put("escapeRate", 0.0);
                obj.put("avgScore", 0.0);
                obj.put("avgTurns", 0.0);
            } else {
                obj.put("escapeRate", row.get("escape_rate", Double.class));
                obj.put("avgScore", row.get("avg_score", Double.class));
                obj.put("avgTurns", row.get("avg_turns", Double.class));
            }
            return obj;
        }).one();

        Mono<String> topStrategyMono = db.sql(SQL_TOP_STRATEGY)
                .map((row, meta) -> row.get("strategy", String.class))
                .one()
                .defaultIfEmpty("-");

        return Mono.zip(globalMono, topStrategyMono).map(tuple -> {
            ObjectNode result = tuple.getT1();
            result.put("topStrategy", tuple.getT2());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
