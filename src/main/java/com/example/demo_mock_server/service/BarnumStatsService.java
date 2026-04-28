package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 巴纳姆效应盲测 — 业务逻辑层
 * <p>
 * 记录每次测结果，提供按分组的聚合统计（tarot vs random）。
 */
public class BarnumStatsService {

    private static final Logger log = LoggerFactory.getLogger(BarnumStatsService.class);

    /* ── DDL ── */
    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS barnum_results (
            id            BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_group    VARCHAR(10) NOT NULL,
            rating_1      TINYINT     NOT NULL,
            rating_2      TINYINT     NOT NULL,
            rating_3      TINYINT     NOT NULL,
            rating_4      TINYINT     NOT NULL,
            rating_5      TINYINT     NOT NULL,
            avg_rating    DOUBLE      NOT NULL,
            created_at    BIGINT      NOT NULL,
            INDEX idx_user_group (user_group),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    /* ── SQL ── */
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

    private static final String SQL_TOTAL = """
        SELECT COUNT(*) AS total FROM barnum_results
        """;

    private final MySQLPool pool;

    public BarnumStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("barnum_results init failed: {}", ar.cause().getMessage());
            else log.info("barnum_results table ready");
        });
    }

    /**
     * 提交一次测试结果
     */
    public Future<Void> submit(String userGroup,
                               int rating1, int rating2, int rating3, int rating4, int rating5) {
        double avg = (rating1 + rating2 + rating3 + rating4 + rating5) / 5.0;
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(userGroup, rating1, rating2, rating3, rating4, rating5, avg, now))
            .mapEmpty();
    }

    /**
     * 查询全局聚合统计（按分组）
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> groupFuture = pool.query(SQL_GROUP_STATS).execute().map(rows -> {
            JsonObject obj = new JsonObject();
            rows.forEach(row -> {
                String group = row.getString("user_group");
                obj.put(group + "Count", row.getLong("cnt"));
                obj.put(group + "Avg", row.getDouble("avg_rating"));
            });
            return obj;
        });

        Future<JsonObject> distFuture = pool.query(SQL_DISTRIBUTION).execute().map(rows -> {
            int[] tarotDist = new int[5];
            int[] randomDist = new int[5];
            rows.forEach(row -> {
                String group = row.getString("user_group");
                int rating = row.getInteger("rating");
                long cnt = row.getLong("cnt");
                if (rating >= 1 && rating <= 5) {
                    if ("tarot".equals(group)) tarotDist[rating - 1] += (int) cnt;
                    else if ("random".equals(group)) randomDist[rating - 1] += (int) cnt;
                }
            });
            List<Integer> tList = new ArrayList<>();
            List<Integer> rList = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                tList.add(tarotDist[i]);
                rList.add(randomDist[i]);
            }
            return new JsonObject()
                .put("tarotDistribution", new JsonArray(tList))
                .put("randomDistribution", new JsonArray(rList));
        });

        return Future.all(groupFuture, distFuture).map(cf -> {
            JsonObject group = cf.resultAt(0);
            JsonObject dist = cf.resultAt(1);

            double tarotAvg = group.getDouble("tarotAvg", 0.0);
            double randomAvg = group.getDouble("randomAvg", 0.0);
            long tarotCount = group.getLong("tarotCount", 0L);
            long randomCount = group.getLong("randomCount", 0L);

            double diff = Math.round((tarotAvg - randomAvg) * 100.0) / 100.0;
            int diffPercent = randomAvg > 0 ? (int) Math.round(diff / randomAvg * 100) : 0;

            return new JsonObject()
                .put("tarotAvg", tarotAvg)
                .put("randomAvg", randomAvg)
                .put("tarotCount", tarotCount)
                .put("randomCount", randomCount)
                .put("diff", diff)
                .put("diffPercent", diffPercent)
                .put("tarotDistribution", dist.getJsonArray("tarotDistribution"))
                .put("randomDistribution", dist.getJsonArray("randomDistribution"));
        });
    }
}
