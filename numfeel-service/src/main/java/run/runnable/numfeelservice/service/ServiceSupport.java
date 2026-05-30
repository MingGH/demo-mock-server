package run.runnable.numfeelservice.service;

import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import reactor.core.publisher.Mono;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

/**
 * service 包内部共享的查询与统计辅助方法。
 * <p>
 * 目标是把重复的 R2DBC 查询、四舍五入和简单聚合逻辑集中起来，
 * 让各个业务 service 只保留领域相关的组装与计算代码。
 */
final class ServiceSupport {

    private ServiceSupport() {
    }

    /** 查询指定实体的全表数据，并聚合成 List 供内存统计使用。 */
    static <T> Mono<List<T>> selectAll(R2dbcEntityTemplate template, Class<T> entityType) {
        return template.select(entityType).all().collectList();
    }

    /** 将 limit 约束在可接受范围内。 */
    static int clampLimit(int limit, int min, int max) {
        return Math.max(min, Math.min(limit, max));
    }

    /** 按指定小数位数做四舍五入。 */
    static double round(double value, int scale) {
        double factor = Math.pow(10.0, scale);
        return Math.round(value * factor) / factor;
    }

    /** 计算百分比并四舍五入。 */
    static double percentage(long numerator, long denominator, int scale) {
        if (denominator <= 0) {
            return 0.0;
        }
        return round(numerator * 100.0 / denominator, scale);
    }

    /** 计算比例值并四舍五入。 */
    static double ratio(long numerator, long denominator, int scale) {
        if (denominator <= 0) {
            return 0.0;
        }
        return round((double) numerator / denominator, scale);
    }

    /** 统计某个维度去重后的非空值数量。 */
    static <T> long distinctNonNullCount(List<T> rows, Function<T, ?> extractor) {
        return rows.stream()
                .map(extractor)
                .filter(Objects::nonNull)
                .distinct()
                .count();
    }

    /** 按分类器统计数量，并保持插入顺序。 */
    static <T, K> Map<K, Long> countBy(List<T> rows, Function<T, K> classifier) {
        Map<K, Long> counts = new LinkedHashMap<>();
        rows.stream()
                .collect(java.util.stream.Collectors.groupingBy(classifier, LinkedHashMap::new, java.util.stream.Collectors.counting()))
                .forEach(counts::put);
        return counts;
    }

    /** 找出出现次数最多的分类值；没有数据时返回默认值。 */
    static <T, K> K mostFrequentOrDefault(List<T> rows, Function<T, K> classifier, K defaultValue) {
        return rows.stream()
                .collect(java.util.stream.Collectors.groupingBy(classifier, java.util.stream.Collectors.counting()))
                .entrySet()
                .stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(defaultValue);
    }

    /** 返回按给定比较器排序后的新列表，不修改原始集合。 */
    static <T> List<T> sorted(List<T> rows, Comparator<? super T> comparator) {
        return rows.stream().sorted(comparator).toList();
    }
}
