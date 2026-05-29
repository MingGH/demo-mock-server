package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Set;

/**
 * 纽科姆悖论 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class NewcombService {

    private static final Set<String> VALID_CHOICES = Set.of("one", "two");

    private static final String SQL_INSERT = """
        INSERT INTO newcomb_results (choice, prediction, hit, payoff, created_at)
        VALUES (?, ?, ?, ?, ?)
        """;

    private static final String SQL_STATS = """
        SELECT
            COUNT(*)                                    AS total,
            SUM(CASE WHEN choice = 'one' THEN 1 ELSE 0 END)  AS one_box,
            SUM(CASE WHEN choice = 'two' THEN 1 ELSE 0 END)  AS two_box,
            SUM(hit)                                    AS hits,
            ROUND(AVG(CASE WHEN choice = 'one' THEN payoff END))  AS avg_one_payoff,
            ROUND(AVG(CASE WHEN choice = 'two' THEN payoff END))  AS avg_two_payoff
        FROM newcomb_results
        """;

    private final DatabaseClient db;

    public NewcombService(DatabaseClient db) {
        this.db = db;
    }

    public boolean isValidChoice(String choice) {
        return choice != null && VALID_CHOICES.contains(choice);
    }

    public Mono<ObjectNode> submit(String choice, String prediction, boolean hit, int payoff) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, choice).bind(1, prediction).bind(2, hit ? 1 : 0)
                .bind(3, payoff).bind(4, now)
                .fetch().rowsUpdated()
                .then(queryStats());
    }

    public Mono<ObjectNode> stats() {
        return queryStats();
    }

    private Mono<ObjectNode> queryStats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            long total = nz(row.get("total", Long.class));
            long oneBox = nz(row.get("one_box", Long.class));
            long twoBox = nz(row.get("two_box", Long.class));
            long hits = nz(row.get("hits", Long.class));
            Double avgOnePayoff = row.get("avg_one_payoff", Double.class);
            Double avgTwoPayoff = row.get("avg_two_payoff", Double.class);

            double hitRate = total > 0 ? Math.round((double) hits / total * 1000.0) / 10.0 : 0;
            double oneBoxPct = total > 0 ? Math.round((double) oneBox / total * 1000.0) / 10.0 : 0;
            double twoBoxPct = total > 0 ? Math.round((double) twoBox / total * 1000.0) / 10.0 : 0;

            ObjectNode obj = Json.obj();
            obj.put("total", total);
            obj.put("oneBox", oneBox);
            obj.put("twoBox", twoBox);
            obj.put("hits", hits);
            obj.put("hitRate", hitRate);
            obj.put("oneBoxPct", oneBoxPct);
            obj.put("twoBoxPct", twoBoxPct);
            obj.put("avgOnePayoff", avgOnePayoff != null ? avgOnePayoff.longValue() : 0);
            obj.put("avgTwoPayoff", avgTwoPayoff != null ? avgTwoPayoff.longValue() : 0);
            return obj;
        }).one();
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
