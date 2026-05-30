package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SoritesBucket;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SoritesStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SoritesResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 沙堆悖论 — 业务逻辑层（R2DBC 重写自 Vert.x 版）。
 * <p>
 * 记录每位用户的三个实验边界值，提供全局聚合统计。
 */
@Service
public class SoritesService {

    private final R2dbcEntityTemplate template;

    public SoritesService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /** 提交一次实验结果。 */
    public Mono<Void> submit(int sandBoundary, String sandSharpness,
                             int baldBoundary, int colorBoundary) {
        SoritesResult entity = new SoritesResult(
                null,
                sandBoundary,
                sandSharpness,
                baldBoundary,
                colorBoundary,
                System.currentTimeMillis()
        );
        return template.insert(SoritesResult.class).using(entity).then();
    }

    /** 查询全局统计。 */
    public Mono<SoritesStatsResponse> stats() {
        return ServiceSupport.selectAll(template, SoritesResult.class)
                .map(this::toStatsResponse);
    }

    /** 从原始边界值样本中构建均值、中位数和分桶分布。 */
    private SoritesStatsResponse toStatsResponse(List<SoritesResult> rows) {
        List<Integer> sandList = rows.stream().map(SoritesResult::sandBoundary).toList();
        List<Integer> baldList = rows.stream().map(SoritesResult::baldBoundary).toList();
        List<Integer> colorList = rows.stream().map(SoritesResult::colorBoundary).toList();

        return new SoritesStatsResponse(
                rows.size(),
                roundAvgInt(sandList),
                roundAvgInt(baldList),
                roundAvgInt(colorList),
                median(sandList),
                median(baldList),
                median(colorList),
                bucketize(sandList, 10, 10000),
                bucketize(baldList, 10, 100000),
                bucketize(colorList, 10, 100)
        );
    }

    /** 计算整数样本平均值并四舍五入。 */
    private long roundAvgInt(List<Integer> values) {
        if (values.isEmpty()) {
            return 0L;
        }
        double avg = values.stream().mapToInt(Integer::intValue).average().orElse(0);
        return Math.round(avg);
    }

    /** 计算中位数，偶数样本时取中间两项平均。 */
    protected int median(List<Integer> values) {
        if (values == null || values.isEmpty()) return 0;
        List<Integer> sorted = new ArrayList<>(values);
        sorted.sort(Comparator.naturalOrder());
        int n = sorted.size();
        if (n % 2 == 0) return (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2;
        return sorted.get(n / 2);
    }

    /** 将连续数值按固定桶数切分，生成前端柱状图使用的分布数据。 */
    protected List<SoritesBucket> bucketize(List<Integer> values, int bucketCount, int maxVal) {
        int bucketSize = maxVal / bucketCount;
        int[] counts = new int[bucketCount];
        for (int v : values) {
            int idx = Math.min(v / bucketSize, bucketCount - 1);
            if (idx < 0) idx = 0;
            counts[idx]++;
        }
        List<SoritesBucket> buckets = new ArrayList<>(bucketCount);
        for (int i = 0; i < bucketCount; i++) {
            int from = i * bucketSize;
            int to = (i + 1) * bucketSize;
            buckets.add(new SoritesBucket(from + "-" + to, counts[i]));
        }
        return buckets;
    }
}
