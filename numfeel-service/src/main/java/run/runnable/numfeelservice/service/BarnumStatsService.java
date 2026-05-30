package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.BarnumStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.BarnumResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

/**
 * 巴纳姆效应盲测 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class BarnumStatsService {

    private final R2dbcEntityTemplate template;

    public BarnumStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<Void> submit(String userGroup,
                             int rating1, int rating2, int rating3, int rating4, int rating5) {
        BarnumResult entity = new BarnumResult(
                null, userGroup, rating1, rating2, rating3, rating4, rating5,
                avg(rating1, rating2, rating3, rating4, rating5), System.currentTimeMillis());
        return template.insert(BarnumResult.class).using(entity).then();
    }

    public Mono<BarnumStatsResponse> stats() {
        return ServiceSupport.selectAll(template, BarnumResult.class)
                .map(this::buildStatsResponse);
    }

    /** 计算两组平均分、样本量和 1-5 分分布。 */
    private BarnumStatsResponse buildStatsResponse(List<BarnumResult> rows) {
        long tarotCount = rows.stream().filter(row -> "tarot".equals(row.userGroup())).count();
        long randomCount = rows.stream().filter(row -> "random".equals(row.userGroup())).count();
        double tarotAvg = averageRating(rows, "tarot");
        double randomAvg = averageRating(rows, "random");
        List<Integer> tarotDistribution = buildDistribution(rows, "tarot");
        List<Integer> randomDistribution = buildDistribution(rows, "random");
        double diff = ServiceSupport.round(tarotAvg - randomAvg, 2);
        int diffPercent = randomAvg > 0 ? (int) Math.round(diff / randomAvg * 100) : 0;

        return new BarnumStatsResponse(
                tarotAvg,
                randomAvg,
                tarotCount,
                randomCount,
                diff,
                diffPercent,
                tarotDistribution,
                randomDistribution
        );
    }

    /** 计算指定组别的平均认同分。 */
    private double averageRating(List<BarnumResult> rows, String group) {
        return ServiceSupport.round(rows.stream()
                .filter(row -> group.equals(row.userGroup()))
                .mapToDouble(BarnumResult::avgRating)
                .average()
                .orElse(0), 2);
    }

    /** 统计指定组别在 1-5 分上的分布。 */
    private List<Integer> buildDistribution(List<BarnumResult> rows, String group) {
        int[] counts = new int[5];
        rows.stream()
                .filter(row -> group.equals(row.userGroup()))
                .forEach(row -> applyRatings(counts, row));

        return IntStream.range(0, counts.length)
                .mapToObj(index -> counts[index])
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
    }

    /** 将单条记录的 5 个评分累计到分布数组。 */
    private void applyRatings(int[] counts, BarnumResult row) {
        int[] values = {row.rating1(), row.rating2(), row.rating3(), row.rating4(), row.rating5()};
        for (int rating : values) {
            if (rating >= 1 && rating <= 5) {
                counts[rating - 1]++;
            }
        }
    }

    /** 计算五条描述认同度的平均值。 */
    private double avg(double rating1, double rating2, double rating3, double rating4, double rating5) {
        return (rating1 + rating2 + rating3 + rating4 + rating5) / 5.0;
    }
}
