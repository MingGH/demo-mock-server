package run.runnable.numfeelservice.controller.dto;

/**
 * gps-time（GPS 的真正产品是时间）演示的时间同步响应 DTO。
 */
public final class TimeSyncResponses {

    private TimeSyncResponses() {
    }

    /**
     * 上游 NTP 同步质量。
     *
     * @param server               本次实际采用的 NTP 上游服务器主机名
     * @param offsetMillis         服务端时钟 − NTP 参考（正 = 服务端偏快）；注意与 Commons Net
     *                             {@code TimeInfo.getMessage().getOffset()}（RFC 5905 θ = 参考 − 本地）
     *                             符号相反，实现时取负
     * @param delayMillis          该次 NTP 往返延迟（服务端到上游）
     * @param stratum              上游 NTP stratum 层级
     * @param measuredEpochMillis  校正所处的服务端 epoch 毫秒（已按 offset 校正后的值）
     */
    public record NtpQuality(String server,
                             double offsetMillis,
                             double delayMillis,
                             int stratum,
                             long measuredEpochMillis) {
    }

    /**
     * 单次时间同步结果。
     *
     * @param recvEpochMillis      t2：服务端收到请求的时刻（UTC epoch 毫秒；source=ntp 时已按上游校正）
     * @param sendEpochMillis      t3：服务端生成响应的时刻
     * @param source               {@code ntp}（拿到并用了真 NTP）或 {@code unavailable}（拿不到，诚实报不可用）
     * @param ntp                  上游同步质量；source=unavailable 时为 null
     * @param unavailableReason    source=unavailable 时说明原因，否则 null
     */
    public record TimeSyncResponse(long recvEpochMillis,
                                   long sendEpochMillis,
                                   String source,
                                   NtpQuality ntp,
                                   String unavailableReason) {
    }
}