package run.runnable.numfeelservice.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * 工具类接口使用的响应 DTO。
 */
public final class UtilityResponses {

    private UtilityResponses() {
    }

    /**
     * IP 地理位置查询结果。
     *
     * @param country 国家名称
     * @param countryCode 国家 ISO 代码
     * @param lat 纬度
     * @param lng 经度
     * @param city 城市名称
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record GeoLocationResponse(
            String country,
            String countryCode,
            Double lat,
            Double lng,
            String city
    ) {
    }

    /**
     * 文档追踪单次打开事件。
     *
     * @param time 访问时间
     * @param ip 访问来源 IP
     * @param ua 浏览器 User-Agent
     * @param device 设备类型描述
     * @param os 操作系统描述
     */
    public record DocTrackEventResponse(
            String time,
            String ip,
            String ua,
            String device,
            String os
    ) {
    }

    /**
     * 文档追踪事件列表响应。
     *
     * @param events 访问事件列表
     * @param count 事件总数
     */
    public record DocTrackEventsResponse(
            List<DocTrackEventResponse> events,
            int count
    ) {
    }

    /**
     * 量子随机数接口响应。
     *
     * @param status 上游服务状态码
     * @param data 随机数结果列表
     * @param source 数据来源说明
     * @param provider 上游供应商标识
     */
    public record QuantumNumbersResponse(
            int status,
            List<Integer> data,
            String source,
            String provider
    ) {
    }

    /**
     * 通用数字型状态响应。
     *
     * @param status 状态码
     * @param data 数字型数据载荷
     * @param message 附加说明
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NumericStatusResponse(
            int status,
            Long data,
            String message
    ) {
    }

    /**
     * StatsProxy getAll 聚合响应。
     *
     * @param players 玩家数量
     * @param bankrupt 破产人数
     * @param billionaire 成为亿万富翁的人数
     */
    public record StatsProxyGetAllResponse(
            int players,
            int bankrupt,
            int billionaire
    ) {
    }

    /**
     * 传输实验指标响应。
     *
     * @param bytes 总传输字节数
     * @param latencyMs 平均新鲜度延迟，单位毫秒
     * @param serverMs 服务端工作量，单位毫秒
     * @param memoryMb 连接相关内存占用，单位 MB
     * @param operations 请求或消息数量
     */
    public record TransportMetricResponse(
            long bytes,
            int latencyMs,
            double serverMs,
            double memoryMb,
            long operations
    ) {
    }

    /**
     * 传输实验概要。
     *
     * @param wsBytesSavedPercent WebSocket 相对 HTTP 节省的流量百分比
     * @param wsServerSavedPercent WebSocket 相对 HTTP 节省的服务端工作量百分比
     * @param wsLatencySavedPercent WebSocket 相对 HTTP 节省的延迟百分比
     * @param wsMemoryPenaltyPercent WebSocket 相对 HTTP 增加的内存百分比
     */
    public record TransportSummaryResponse(
            double wsBytesSavedPercent,
            double wsServerSavedPercent,
            double wsLatencySavedPercent,
            double wsMemoryPenaltyPercent
    ) {
    }

    /**
     * WebSocket/HTTP 传输实验快照。
     *
     * @param recommendation 推荐方案
     * @param reason 推荐理由
     * @param eventCount 会话内业务事件数
     * @param pollCount HTTP 轮询次数
     * @param http HTTP 指标
     * @param websocket WebSocket 指标
     * @param summary 对比概要
     */
    public record TransportSnapshotResponse(
            String recommendation,
            String reason,
            int eventCount,
            int pollCount,
            TransportMetricResponse http,
            TransportMetricResponse websocket,
            TransportSummaryResponse summary
    ) {
    }

    /**
     * 不带统一包裹的简单错误响应。
     *
     * @param error 错误文案
     */
    public record RawErrorResponse(String error) {
    }

    /**
     * 词云中的单个词条。
     *
     * @param name 词语
     * @param value 出现次数
     */
    public record WordCloudEntryResponse(
            String name,
            int value
    ) {
    }

    /**
     * 词云搜索结果。
     *
     * @param word 搜索词
     * @param count 出现次数
     * @param inTop300 是否位于 Top 300
     */
    public record WordCloudSearchResponse(
            String word,
            int count,
            boolean inTop300
    ) {
    }

    /**
     * 假数据生成人员记录。
     *
     * @param id 记录编号
     * @param name 姓名
     * @param email 邮箱
     * @param phone 电话
     * @param address 地址
     * @param company 公司
     * @param dob 出生日期
     * @param job 职业
     */
    public record MockPersonResponse(
            int id,
            String name,
            String email,
            String phone,
            String address,
            String company,
            String dob,
            String job
    ) {
    }

    /**
     * P2P 隐私透视镜 — 单个 peer 信息（IP 已打码）。
     *
     * @param ip 打码后的 IP（如 "104.25.*.*"）
     * @param port 端口号
     * @param country 国家名称
     * @param countryCode ISO 国家代码
     * @param city 城市名称
     * @param lat 纬度
     * @param lng 经度
     * @param discoveredAt 发现时间戳（毫秒）
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record P2pPeerResponse(
            String ip, int port, String country, String countryCode,
            String city, double lat, double lng, long discoveredAt
    ) {
    }

    /**
     * P2P 隐私透视镜 — torrent 概要。
     *
     * @param index 预设索引
     * @param name torrent 文件名
     * @param infohash SHA1 infohash
     */
    public record P2pTorrentResponse(int index, String name, String infohash) {
    }

    /**
     * P2P 隐私透视镜 — peer 发现结果。
     *
     * @param torrentName torrent 文件名
     * @param infohash SHA1 infohash
     * @param totalPeers 发现的 peer 总数
     * @param countryDistribution 按国家统计的 peer 分布
     * @param sampleLog 最近 20 条 peer 样本（IP 已打码）
     * @param updatedAt 数据更新时间戳
     */
    public record P2pDiscoveryResponse(
            String torrentName, String infohash, int totalPeers,
            java.util.Map<String, Long> countryDistribution,
            List<P2pPeerResponse> sampleLog,
            long updatedAt
    ) {
    }

    /**
     * 真随机字节接口响应。
     *
     * @param bytes 随机字节序列（0–255）
     * @param source 实际使用的熵源：quantum / atmospheric / secure
     * @param provider 上游供应商描述
     * @param degraded 是否从用户请求的源被降级过（诚实标注）
     * @param requestedSource 用户原本请求的熵源
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RandomBytesResponse(
            List<Integer> bytes,
            String source,
            String provider,
            Boolean degraded,
            String requestedSource
    ) {
    }

    /**
     * 真随机彩票接口响应。
     *
     * @param type 玩法：ssq 或 dlt
     * @param red 双色球红球（6 个）
     * @param blue 双色球蓝球（1 个）
     * @param front 大乐透前区（5 个）
     * @param back 大乐透后区（2 个）
     * @param source 实际使用的熵源
     * @param provider 上游供应商描述
     * @param degraded 是否被降级过
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RandomLotteryResponse(
            String type,
            List<Integer> red,
            Integer blue,
            List<Integer> front,
            List<Integer> back,
            String source,
            String provider,
            Boolean degraded
    ) {
    }

    /**
     * 真随机固定位数/区间随机数接口响应。
     *
     * @param values 生成的随机数列表（区间模式）
     * @param value 生成的随机数字字符串（固定位数模式）
     * @param source 实际使用的熵源
     * @param provider 上游供应商描述
     * @param degraded 是否被降级过
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RandomDigitsResponse(
            List<Integer> values,
            String value,
            String source,
            String provider,
            Boolean degraded
    ) {
    }
}
