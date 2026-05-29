package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 巴纳姆效应盲测 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class BarnumStatsService {

    private static final String SQL_INSERT = """
        INSERT INTO barnum_results
          (user_group, rating_1, rating_2, rating_3, rating_4, rating_5, avg_rating, created_at)
        VALUES (?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_GROUP_STATS = """
        SELECT
          user_group,
          COUNT(*)                              AS cnt,
          ROUND(AVG(avg_rating), 2)             AS avg_rating
        FROM barnum_results
        GROUP BY user_group
        """;

    private static final String SQL_DISTRIBUTION = """
        SELECT
          user_group,
          rating_1 AS rating,
          COUNT(*) AS cnt FROM barnum_results GROUP BY user_group, rating_1
        UNION ALL SELECT user_group, rating_2, COUNT(*) FROM barnum_results GROUP BY user_group, rating_2
        UNION ALL SELECT user_group, rating_3, COUNT(*) FROM barnum_results GROUP BY user_group, rating_3
        UNION ALL SELECT user_group, rating_4, COUNT(*) FROM barnum_results GROUP BY user_group, rating_4
        UNION ALL SELECT user_group, rating_5, COUNT(*) FROM barnum_results GROUP BY user_group, rating_5
        """;

    private final DatabaseClient db;

    public BarnumStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<Void> submit(String userGroup,
                             int rating1, int rating2, int rating3, int rating4, int rating5) {
        double avg = (rating1 + rating2 + rating3 + rating4 + rating5) / 5.0;
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, userGroup).bind(1, rating1).bind(2, rating2).bind(3, rating3)
                .bind(4, rating4).bind(5, rating5).bind(6, avg).bind(7, now)
                .fetch().rowsUpdated().then();
    }

    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> groupMono = db.sql(SQL_GROUP_STATS).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("group", row.get("user_group", String.class));
            o.put("cnt", nz(row.get("cnt", Long.class)));
            o.put("avg", row.get("avg_rating", Double.class));
            return o;
        }).all().collectList().map(rows -> {
            ObjectNode obj = Json.obj();
            for (ObjectNode r : rows) {
                String group = r.get("group").asText();
                obj.put(group + "Count", r.get("cnt").asLong());
                obj.put(group + "Avg", r.get("avg").isNull() ? 0.0 : r.get("avg").asDouble());
            }
            return obj;
        });

        Mono<ObjectNode> distMono = db.sql(SQL_DISTRIBUTION).map((row, meta) -> {
            ObjectNode o = Json.obj();
            o.put("group", row.get("user_group", String.class));
            Integer rating = row.get("rating", Integer.class);
            o.put("rating", rating == null ? 0 : rating);
            o.put("cnt", nz(row.get("cnt", Long.class)));
            return o;
        }).all().collectList().map(rows -> {
            int[] tarotDist = new int[5];
            int[] randomDist = new int[5];
            for (ObjectNode r : rows) {
                String group = r.get("group").asText();
                int rating = r.get("rating").asInt();
                long cnt = r.get("cnt").asLong();
                if (rating >= 1 && rating <= 5) {
                    if ("tarot".equals(group)) tarotDist[rating - 1] += (int) cnt;
                    else if ("random".equals(group)) randomDist[rating - 1] += (int) cnt;
                }
            }
            ArrayNode tArr = Json.arr();
            ArrayNode rArr = Json.arr();
            for (int i = 0; i < 5; i++) {
                tArr.add(tarotDist[i]);
                rArr.add(randomDist[i]);
            }
            ObjectNode o = Json.obj();
            o.set("tarotDistribution", tArr);
            o.set("randomDistribution", rArr);
            return o;
        });

        return Mono.zip(groupMono, distMono).map(tuple -> {
            ObjectNode group = tuple.getT1();
            ObjectNode dist = tuple.getT2();

            double tarotAvg = group.has("tarotAvg") ? group.get("tarotAvg").asDouble() : 0.0;
            double randomAvg = group.has("randomAvg") ? group.get("randomAvg").asDouble() : 0.0;
            long tarotCount = group.has("tarotCount") ? group.get("tarotCount").asLong() : 0L;
            long randomCount = group.has("randomCount") ? group.get("randomCount").asLong() : 0L;

            double diff = Math.round((tarotAvg - randomAvg) * 100.0) / 100.0;
            int diffPercent = randomAvg > 0 ? (int) Math.round(diff / randomAvg * 100) : 0;

            ObjectNode result = Json.obj();
            result.put("tarotAvg", tarotAvg);
            result.put("randomAvg", randomAvg);
            result.put("tarotCount", tarotCount);
            result.put("randomCount", randomCount);
            result.put("diff", diff);
            result.put("diffPercent", diffPercent);
            result.set("tarotDistribution", dist.get("tarotDistribution"));
            result.set("randomDistribution", dist.get("randomDistribution"));
            return result;
        });
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
