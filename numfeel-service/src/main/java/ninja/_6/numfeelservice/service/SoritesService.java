package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 沙堆悖论 — 业务逻辑层（R2DBC 重写自 Vert.x 版）。
 * <p>
 * 记录每位用户的三个实验边界值，提供全局聚合统计。
 */
@Service
public class SoritesService {

    private static final String SQL_INSERT = """
        INSERT INTO sorites_results
          (sand_boundary, sand_sharpness, bald_boundary, color_boundary, created_at)
        VALUES (?, ?, ?, ?, ?)
        """;

    private static final String SQL_SAND_BOUNDARIES = "SELECT sand_boundary FROM sorites_results";
    private static final String SQL_BALD_BOUNDARIES = "SELECT bald_boundary FROM sorites_results";
    private static final String SQL_COLOR_BOUNDARIES = "SELECT color_boundary FROM sorites_results";

    private static final String SQL_SUMMARY = """
        SELECT
          COUNT(*)                                    AS total_count,
          ROUND(AVG(sand_boundary))                   AS sand_mean,
          ROUND(AVG(bald_boundary))                   AS bald_mean,
          ROUND(AVG(color_boundary))                  AS color_mean
        FROM sorites_results
        """;

    private final DatabaseClient db;

    public SoritesService(DatabaseClient db) {
        this.db = db;
    }

    /** 提交一次实验结果。 */
    public Mono<Void> submit(int sandBoundary, String sandSharpness,
                             int baldBoundary, int colorBoundary) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, sandBoundary)
                .bind(1, sandSharpness)
                .bind(2, baldBoundary)
                .bind(3, colorBoundary)
                .bind(4, now)
                .fetch().rowsUpdated().then();
    }

    /** 查询全局统计。 */
    public Mono<ObjectNode> stats() {
        Mono<ObjectNode> summaryMono = db.sql(SQL_SUMMARY).map((row, meta) -> {
            ObjectNode obj = Json.obj();
            Long totalCount = row.get("total_count", Long.class);
            Long sandMean = row.get("sand_mean", Long.class);
            Long baldMean = row.get("bald_mean", Long.class);
            Long colorMean = row.get("color_mean", Long.class);
            obj.put("totalCount", totalCount == null ? 0L : totalCount);
            obj.put("sandMean", sandMean == null ? 0L : sandMean);
            obj.put("baldMean", baldMean == null ? 0L : baldMean);
            obj.put("colorMean", colorMean == null ? 0L : colorMean);
            return obj;
        }).one().defaultIfEmpty(emptySummary());

        Mono<List<Integer>> sandMono = collectInts(SQL_SAND_BOUNDARIES);
        Mono<List<Integer>> baldMono = collectInts(SQL_BALD_BOUNDARIES);
        Mono<List<Integer>> colorMono = collectInts(SQL_COLOR_BOUNDARIES);

        return Mono.zip(summaryMono, sandMono, baldMono, colorMono).map(tuple -> {
            ObjectNode summary = tuple.getT1();
            List<Integer> sandList = tuple.getT2();
            List<Integer> baldList = tuple.getT3();
            List<Integer> colorList = tuple.getT4();

            summary.put("sandMedian", median(sandList));
            summary.put("baldMedian", median(baldList));
            summary.put("colorMedian", median(colorList));

            summary.set("sandDistribution", bucketize(sandList, 10, 10000));
            summary.set("baldDistribution", bucketize(baldList, 10, 100000));
            summary.set("colorDistribution", bucketize(colorList, 10, 100));
            return summary;
        });
    }

    private ObjectNode emptySummary() {
        ObjectNode obj = Json.obj();
        obj.put("totalCount", 0L);
        obj.put("sandMean", 0L);
        obj.put("baldMean", 0L);
        obj.put("colorMean", 0L);
        return obj;
    }

    private Mono<List<Integer>> collectInts(String sql) {
        return db.sql(sql)
                .map((row, meta) -> row.get(0, Integer.class))
                .all()
                .collectList();
    }

    protected int median(List<Integer> values) {
        if (values == null || values.isEmpty()) return 0;
        List<Integer> sorted = new ArrayList<>(values);
        sorted.sort(Integer::compareTo);
        int n = sorted.size();
        if (n % 2 == 0) return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2;
        return sorted.get(n / 2);
    }

    protected ArrayNode bucketize(List<Integer> values, int bucketCount, int maxVal) {
        int bucketSize = maxVal / bucketCount;
        int[] counts = new int[bucketCount];
        for (int v : values) {
            int idx = Math.min(v / bucketSize, bucketCount - 1);
            if (idx < 0) idx = 0;
            counts[idx]++;
        }
        ArrayNode arr = Json.arr();
        for (int i = 0; i < bucketCount; i++) {
            int from = i * bucketSize;
            int to = (i + 1) * bucketSize;
            ObjectNode b = Json.obj();
            b.put("label", from + "-" + to);
            b.put("count", counts[i]);
            arr.add(b);
        }
        return arr;
    }
}
