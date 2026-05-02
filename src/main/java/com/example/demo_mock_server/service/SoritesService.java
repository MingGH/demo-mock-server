package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.RowSet;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 沙堆悖论 — 业务逻辑层
 * <p>
 * 记录每位用户的三个实验边界值，提供全局聚合统计。
 */
public class SoritesService {

    private static final Logger log = LoggerFactory.getLogger(SoritesService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS sorites_results (
            id              BIGINT AUTO_INCREMENT PRIMARY KEY,
            sand_boundary   INT          NOT NULL,
            sand_sharpness  VARCHAR(20)  NOT NULL,
            bald_boundary   INT          NOT NULL,
            color_boundary  INT          NOT NULL,
            created_at      BIGINT       NOT NULL,
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO sorites_results
          (sand_boundary, sand_sharpness, bald_boundary, color_boundary, created_at)
        VALUES (?, ?, ?, ?, ?)
        """;

    private static final String SQL_SAND_BOUNDARIES = """
        SELECT sand_boundary FROM sorites_results
        """;

    private static final String SQL_BALD_BOUNDARIES = """
        SELECT bald_boundary FROM sorites_results
        """;

    private static final String SQL_COLOR_BOUNDARIES = """
        SELECT color_boundary FROM sorites_results
        """;

    private static final String SQL_SUMMARY = """
        SELECT
          COUNT(*)                                    AS total_count,
          ROUND(AVG(sand_boundary))                   AS sand_mean,
          ROUND(AVG(bald_boundary))                   AS bald_mean,
          ROUND(AVG(color_boundary))                  AS color_mean
        FROM sorites_results
        """;

    private final MySQLPool pool;

    public SoritesService(MySQLPool pool) {
        this.pool = pool;
        if (pool != null) {
            initTable();
        }
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("sorites_results init failed: {}", ar.cause().getMessage());
            else log.info("sorites_results table ready");
        });
    }

    /**
     * 提交一次实验结果
     */
    public Future<Void> submit(int sandBoundary, String sandSharpness,
                               int baldBoundary, int colorBoundary) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(sandBoundary, sandSharpness, baldBoundary, colorBoundary, now))
            .mapEmpty();
    }

    /**
     * 查询全局统计
     */
    public Future<JsonObject> stats() {
        Future<JsonObject> summaryFuture = pool.query(SQL_SUMMARY).execute().map(rows -> {
            JsonObject obj = new JsonObject();
            for (Row row : rows) {
                obj.put("totalCount", row.getLong("total_count"));
                obj.put("sandMean", row.getLong("sand_mean") != null ? row.getLong("sand_mean") : 0);
                obj.put("baldMean", row.getLong("bald_mean") != null ? row.getLong("bald_mean") : 0);
                obj.put("colorMean", row.getLong("color_mean") != null ? row.getLong("color_mean") : 0);
            }
            return obj;
        });

        Future<List<Integer>> sandFuture = pool.query(SQL_SAND_BOUNDARIES).execute()
            .map(this::extractInts);
        Future<List<Integer>> baldFuture = pool.query(SQL_BALD_BOUNDARIES).execute()
            .map(this::extractInts);
        Future<List<Integer>> colorFuture = pool.query(SQL_COLOR_BOUNDARIES).execute()
            .map(this::extractInts);

        return Future.all(summaryFuture, sandFuture, baldFuture, colorFuture).map(cf -> {
            JsonObject summary = cf.resultAt(0);
            List<Integer> sandList = cf.resultAt(1);
            List<Integer> baldList = cf.resultAt(2);
            List<Integer> colorList = cf.resultAt(3);

            // 计算中位数
            summary.put("sandMedian", median(sandList));
            summary.put("baldMedian", median(baldList));
            summary.put("colorMedian", median(colorList));

            // 分桶
            summary.put("sandDistribution", bucketize(sandList, 10, 10000));
            summary.put("baldDistribution", bucketize(baldList, 10, 100000));
            summary.put("colorDistribution", bucketize(colorList, 10, 100));

            return summary;
        });
    }

    private List<Integer> extractInts(RowSet<Row> rows) {
        List<Integer> list = new ArrayList<>();
        for (Row row : rows) {
            list.add(row.getInteger(0));
        }
        return list;
    }

    protected int median(List<Integer> values) {
        if (values == null || values.isEmpty()) return 0;
        List<Integer> sorted = new ArrayList<>(values);
        sorted.sort(Integer::compareTo);
        int n = sorted.size();
        if (n % 2 == 0) return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2;
        return sorted.get(n / 2);
    }

    protected JsonArray bucketize(List<Integer> values, int bucketCount, int maxVal) {
        int bucketSize = maxVal / bucketCount;
        int[] counts = new int[bucketCount];
        for (int v : values) {
            int idx = Math.min(v / bucketSize, bucketCount - 1);
            if (idx < 0) idx = 0;
            counts[idx]++;
        }
        JsonArray arr = new JsonArray();
        for (int i = 0; i < bucketCount; i++) {
            int from = i * bucketSize;
            int to = (i + 1) * bucketSize;
            arr.add(new JsonObject()
                .put("label", from + "-" + to)
                .put("count", counts[i]));
        }
        return arr;
    }
}
