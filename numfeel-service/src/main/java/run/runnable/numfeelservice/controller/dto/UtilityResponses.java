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
}
