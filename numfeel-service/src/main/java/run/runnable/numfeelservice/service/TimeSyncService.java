package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.apache.commons.net.ntp.NTPUDPClient;
import org.apache.commons.net.ntp.TimeInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.NtpQuality;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.TimeSyncResponse;

import java.net.InetAddress;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 时间同步服务：向公共 stratum-2 NTP 上游（UDP/123）取真 NTP 质量，供 gps-time 演示
 * 前端做 HTTP 近似的伪 NTP 测量。
 * <p>
 * 真实度边界（与前端文案约定一致）：
 * <ul>
 *   <li><b>真 NTP</b> 仅指「本服务 ↔ 上游」这一段：走 UDP/123、真解析报文，产出 offset/delay/stratum。</li>
 *   <li>「浏览器 → 本服务」是 HTTP，本接口只负责把服务端已按上游校正的 t2/t3 交给前端算偏移。</li>
 *   <li>失败<b>不降级、不冒充</b>：拿不到上游就把 {@code source} 标为 {@code unavailable}，
 *       绝不返回未校正的系统时钟当结果。</li>
 * </ul>
 * 符号约定：本服务的 {@code offsetMillis} = 服务端 − NTP 参考（正 = 服务端偏快），与
 * Commons Net 返回的 RFC 5905 {@code θ = 参考 − 本地} 相反，实现时取负。
 */
@Service
public class TimeSyncService {

    private static final Logger log = LoggerFactory.getLogger(TimeSyncService.class);

    private static final String[] DEFAULT_SERVERS = {"ntp.aliyun.com", "pool.ntp.org"};
    private static final int NTP_TIMEOUT_MS = 3000;
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);
    private static final String CACHE_KEY = "ntp-quality";

    /** 缓存的是「同步质量」，不是时间本身；t2/t3 每次请求现取，保证新鲜。 */
    private final Cache<String, Optional<NtpQuality>> qualityCache = Caffeine.newBuilder()
            .expireAfterWrite(CACHE_TTL)
            .maximumSize(1)
            .build();

    private final List<String> ntpServers;
    private final NtpFetcher fetcher;

    /**
     * Spring 生产构造：默认双源 + 阻塞式 NTP 查询实现。
     */
    @Autowired
    public TimeSyncService() {
        this(List.of(DEFAULT_SERVERS), TimeSyncService::fetchNtpBlocking);
    }

    /**
     * 测试友好构造：注入服务列表与查询实现，便于打桩。
     *
     * @param ntpServers 待查询的上游 NTP 主机名（依次查询，取 delay 更小的）
     * @param fetcher    单次查询实现；查询失败应抛异常
     */
    TimeSyncService(List<String> ntpServers, NtpFetcher fetcher) {
        this.ntpServers = ntpServers;
        this.fetcher = fetcher;
    }

    /** 上游 NTP 查询函数式接口，便于单元测试打桩。 */
    @FunctionalInterface
    interface NtpFetcher {
        /** @param host 上游主机名 */
        NtpQuality fetch(String host) throws Exception;
    }

    /**
     * 取得一次时间同步结果。
     *
     * @return {@link TimeSyncResponse}；上游不可用时 source=unavailable
     */
    public Mono<TimeSyncResponse> sync() {
        return resolveQuality()
                .map(this::buildResponse);
    }

    /**
     * 取上游同步质量，命中缓存直接返回；否则触达上游（阻塞，切到 boundedElastic）。
     * 失败同样缓存为空 Optional，避免冷缓存下每次请求都去撞上游。
     */
    private Mono<Optional<NtpQuality>> resolveQuality() {
        Optional<NtpQuality> cached = qualityCache.getIfPresent(CACHE_KEY);
        if (cached != null) {
            return Mono.just(cached);
        }
        return Mono.fromCallable(() -> {
            Optional<NtpQuality> quality = queryBestNtp();
            qualityCache.put(CACHE_KEY, quality);
            return quality;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /** 依次查询各源，取 delay 更小的；全失败返回空，不降级、不冒充。 */
    private Optional<NtpQuality> queryBestNtp() {
        NtpQuality best = null;
        List<String> errors = new ArrayList<>();
        for (String host : ntpServers) {
            try {
                NtpQuality q = fetcher.fetch(host);
                if (best == null || q.delayMillis() < best.delayMillis()) {
                    best = q;
                }
            } catch (Exception e) {
                errors.add(host + ": " + e.getMessage());
            }
        }
        if (best == null) {
            log.warn("所有上游 NTP 查询失败: {}", String.join("; ", errors));
        }
        return Optional.ofNullable(best);
    }

    /** 用同步质量构建响应；未拿到时诚实报不可用。 */
    private TimeSyncResponse buildResponse(Optional<NtpQuality> maybeQuality) {
        if (maybeQuality.isEmpty()) {
            long now = System.currentTimeMillis();
            return new TimeSyncResponse(now, now, "unavailable", null,
                    "无法连接上游 NTP（UDP/123 超时或不可达）");
        }
        NtpQuality q = maybeQuality.get();
        // t2（收到）≈ t3（发出）：响应装配与读取近乎同时，保持一致并满足 t2 <= t3。
        long t3 = correctedNowMillis(q.offsetMillis());
        long t2 = t3;
        return new TimeSyncResponse(t2, t3, "ntp", q, null);
    }

    /** 由偏移校正系统时钟：服务端偏快（offset>0）时把时间往回调。 */
    long correctedNowMillis(double offsetMillis) {
        return System.currentTimeMillis() - Math.round(offsetMillis);
    }

    /** 阻塞式默认实现：用 Commons Net 对单台宿主查一次真 NTP。 */
    private static NtpQuality fetchNtpBlocking(String host) throws Exception {
        try (NTPUDPClient client = new NTPUDPClient()) {
            client.setDefaultTimeout(NTP_TIMEOUT_MS);
            client.open();
            TimeInfo info = client.getTime(InetAddress.getByName(host));
            info.computeDetails();
            if (info.getMessage() == null) {
                throw new IllegalStateException("上游未返回 NTP 报文");
            }
            // RFC 5905 θ(参考−本地) 与 DTO(服务端−参考) 符号相反，取负。
            double offsetMillis = -info.getOffset();
            double delayMillis = Math.max(0, info.getDelay());
            int stratum = info.getMessage().getStratum();
            long measured = System.currentTimeMillis() - Math.round(offsetMillis);
            return new NtpQuality(host, offsetMillis, delayMillis, stratum, measured);
        }
    }
}