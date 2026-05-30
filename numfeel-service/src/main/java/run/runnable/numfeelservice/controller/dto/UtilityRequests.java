package run.runnable.numfeelservice.controller.dto;

/**
 * 工具类、查询类接口使用的请求 DTO。
 */
public final class UtilityRequests {

    private UtilityRequests() {
    }

    /**
     * 文档追踪查询参数。
     *
     * @param id 被追踪文档的唯一标识
     */
    public record DocTrackQuery(String id) {
    }

    /**
     * 数据生成接口查询参数。
     *
     * @param n 期望生成的数据条数
     */
    public record GeneratorQuery(String n) {
    }

    /**
     * 通用 limit 查询参数。
     *
     * @param limit 期望返回的最大条数
     */
    public record LimitQuery(String limit) {
    }

    /**
     * 量子随机数接口查询参数。
     *
     * @param count 需要生成的随机数个数
     * @param min 随机数最小值
     * @param max 随机数最大值
     * @param unique 是否要求结果不重复
     */
    public record QuantumNumbersQuery(
            String count,
            String min,
            String max,
            String unique
    ) {
    }

    /**
     * 统计代理接口查询参数。
     *
     * @param action 统计动作，如 `getAll` 或按 key 查询
     * @param key 具体统计项的键名
     * @param n 可选的数量参数
     */
    public record StatsProxyQuery(
            String action,
            String key,
            String n
    ) {
    }

    /**
     * 词云查询参数。
     *
     * @param search 需要搜索的关键词
     */
    public record WordCloudQuery(String search) {
    }
}
