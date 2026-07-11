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
     * 真随机字节接口查询参数。
     *
     * @param count 需要的随机字节个数（1–8192）
     * @param source 熵源：quantum（量子真空涨落，默认）、atmospheric（大气噪声）、secure（本地 SecureRandom）
     */
    public record RandomBytesQuery(
            String count,
            String source
    ) {
    }

    /**
     * 真随机彩票接口查询参数。
     *
     * @param type 玩法：ssq（双色球）、dlt（大乐透）
     * @param source 熵源；留空走量子优先链
     */
    public record RandomLotteryQuery(
            String type,
            String source
    ) {
    }

    /**
     * 真随机固定位数/区间随机数查询参数。
     *
     * @param length 固定位数模式下数字字符串的位数（1–20）
     * @param min 区间模式最小值（含）
     * @param max 区间模式最大值（含）
     * @param count 区间模式生成个数（1–100）
     * @param source 熵源；留空走量子优先链
     */
    public record RandomDigitsQuery(
            String length,
            String min,
            String max,
            String count,
            String source
    ) {
    }
}
