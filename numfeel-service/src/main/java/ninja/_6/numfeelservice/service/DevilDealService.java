package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Set;

/**
 * 恶魔交易诊断 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class DevilDealService {

    private static final Set<String> VALID_TYPES = Set.of(
            "power", "love", "money", "revenge", "recognition", "knowledge");

    private static final String SQL_INSERT = """
        INSERT INTO devil_deal_results
          (deal_type, second_type, power_pct, love_pct, money_pct, revenge_pct, recognition_pct, knowledge_pct, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM devil_deal_results";

    private static final String SQL_TYPE_DIST = """
        SELECT deal_type, COUNT(*) AS cnt
        FROM devil_deal_results
        GROUP BY deal_type
        ORDER BY cnt DESC
        """;

    private static final String SQL_AVG_PCTS = """
        SELECT
          COUNT(*)                          AS total_sessions,
          ROUND(AVG(power_pct), 1)          AS avg_power,
          ROUND(AVG(love_pct), 1)           AS avg_love,
          ROUND(AVG(money_pct), 1)          AS avg_money,
          ROUND(AVG(revenge_pct), 1)        AS avg_revenge,
          ROUND(AVG(recognition_pct), 1)    AS avg_recognition,
          ROUND(AVG(knowledge_pct), 1)      AS avg_knowledge
        FROM devil_deal_results
        """;

    private static final String SQL_SAME_TYPE_COUNT =
            "SELECT COUNT(*) AS cnt FROM devil_deal_results WHERE deal_type = ?";

    private final DatabaseClient db;

    public DevilDealService(DatabaseClient db) {
        this.db = db;
    }

    public boolean isValidType(String type) {
        return type != null && VALID_TYPES.contains(type);
    }

    public boolean isValidPct(Integer pct) {
        return pct != null && pct >= 0 && pct <= 100;
    }

    public Mono<ObjectNode> submit(String dealType, String secondType,
                                   int powerPct, int lovePct, int moneyPct,
                                   int revengePct, int recognitionPct, int knowledgePct) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, dealType).bind(1, secondType).bind(2, powerPct).bind(3, lovePct)
                .bind(4, moneyPct).bind(5, revengePct).bind(6, recognitionPct)
                .bind(7, knowledgePct).bind(8, now)
                .fetch().rowsUpdated()
                .then(db.sql(SQL_SAME_TYPE_COUNT).bind(0, dealType)
                        .map((row, meta) -> nz(row.get("cnt", Long.class))).one())
                .flatMap(sameCount -> db.sql(SQL_TOTAL)
                        .map((row, meta) -> nz(row.get("total", Long.class))).one()
                        .map(total -> {
                            double samePercent = total > 0
                                    ? Math.round((double) sameCount / total * 1000.0) / 10.0 : 0;
                            ObjectNode obj = Json.obj();
                            obj.put("sameCount", sameCount);
                            obj.put("total", total);
                            obj.put("samePercent", samePercent);
                            return obj;
                        }));
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> avgMono = db.sql(SQL_AVG_PCTS).map((row, meta) -> {
            ObjectNode obj = Json.obj();
            obj.put("totalSessions", nz(row.get("total_sessions", Long.class)));
            obj.put("avgPower", row.get("avg_power", Double.class));
            obj.put("avgLove", row.get("avg_love", Double.class));
            obj.put("avgMoney", row.get("avg_money", Double.class));
            obj.put("avgRevenge", row.get("avg_revenge", Double.class));
            obj.put("avgRecognition", row.get("avg_recognition", Double.class));
            obj.put("avgKnowledge", row.get("avg_knowledge", Double.class));
            return obj;
        }).one();

        Mono<ObjectNode> distMono = db.sql(SQL_TYPE_DIST).map((row, meta) ->
                new Object[]{row.get("deal_type", String.class), nz(row.get("cnt", Long.class))}
        ).all().collectList().map(rows -> {
            ObjectNode dist = Json.obj();
            for (Object[] r : rows) {
                dist.put((String) r[0], (Long) r[1]);
            }
            return dist;
        });

        return Mono.zip(avgMono, distMono).map(tuple -> {
            ObjectNode result = Json.obj();
            result.set("global", tuple.getT1());
            result.set("typeDist", tuple.getT2());
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
