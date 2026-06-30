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
     * WebSocket/HTTP 传输实验查询参数。
     *
     * @param eventsPerMinute 每分钟业务事件数
     * @param payloadSize 单条消息载荷字节数
     * @param activeSeconds 客户端在线时长，单位秒
     * @param clients 同时在线客户端数量
     * @param pollInterval HTTP 轮询间隔，单位秒
     * @param reconnects WebSocket 断线重连次数
     */
    public record TransportLabQuery(
            String eventsPerMinute,
            String payloadSize,
            String activeSeconds,
            String clients,
            String pollInterval,
            String reconnects
    ) {
    }

    /**
     * 词云查询参数。
     *
     * @param search 需要搜索的关键词
     */
    public record WordCloudQuery(String search) {
    }

    /**
     * JS 二进制编译请求。
     *
     * @param scenario 预设场景名（fib / sort / strings）
     */
    public record JsBinaryCompileRequest(String scenario) {
    }
}
