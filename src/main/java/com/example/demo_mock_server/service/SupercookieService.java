package com.example.demo_mock_server.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * Favicon 超级 Cookie 演示 — 业务逻辑层
 * <p>
 * 用内存缓存模拟 F-Cache 追踪：按 IP 存储追踪 ID，
 * 即使用户清除 Cookie / 开无痕模式，只要 IP 不变就能识别。
 * <p>
 * 生产环境中真正的 Favicon 追踪不依赖 IP，而是依赖浏览器的 F-Cache 状态。
 * 这里用 IP 做 key 是为了在不配置子域名的前提下给用户一个真实的"被追踪"体验。
 */
public class SupercookieService {

    private static final Logger log = LoggerFactory.getLogger(SupercookieService.class);
    private static final int BITS = 16;

    /**
     * 追踪记录：IP → { trackingId, firstSeen, visitCount, bits }
     * 24 小时过期，最多 50000 条
     */
    private final Cache<String, JsonObject> trackingCache;

    public SupercookieService() {
        this.trackingCache = Caffeine.newBuilder()
                .expireAfterWrite(24, TimeUnit.HOURS)
                .maximumSize(50_000)
                .build();
        log.info("SupercookieService initialized (in-memory, {} bits)", BITS);
    }

    /**
     * 为指定 IP 分配追踪 ID（如果已有则返回已有的）
     *
     * @param ip 客户端 IP
     * @return { trackingId, bits, binary, firstSeen, visitCount, returning }
     */
    public JsonObject assign(String ip) {
        JsonObject existing = trackingCache.getIfPresent(ip);
        if (existing != null) {
            // 老用户回来了
            int visits = existing.getInteger("visitCount", 1) + 1;
            existing.put("visitCount", visits);
            trackingCache.put(ip, existing);
            return new JsonObject()
                    .put("trackingId", existing.getInteger("trackingId"))
                    .put("bits", BITS)
                    .put("binary", existing.getString("binary"))
                    .put("firstSeen", existing.getString("firstSeen"))
                    .put("visitCount", visits)
                    .put("returning", true);
        }

        // 新用户，分配随机 ID
        int trackingId = ThreadLocalRandom.current().nextInt(0, (1 << BITS));
        String binary = toBinaryString(trackingId, BITS);
        String now = Instant.now().toString();

        JsonObject record = new JsonObject()
                .put("trackingId", trackingId)
                .put("bits", BITS)
                .put("binary", binary)
                .put("firstSeen", now)
                .put("visitCount", 1);

        trackingCache.put(ip, record);
        log.info("Assigned tracking ID {} ({}) to IP {}", trackingId, binary, maskIp(ip));

        return new JsonObject()
                .put("trackingId", trackingId)
                .put("bits", BITS)
                .put("binary", binary)
                .put("firstSeen", now)
                .put("visitCount", 1)
                .put("returning", false);
    }

    /**
     * 读取指定 IP 的追踪 ID（模拟 F-Cache 读取）
     *
     * @param ip 客户端 IP
     * @return { found, trackingId, ... } 或 { found: false }
     */
    public JsonObject identify(String ip) {
        JsonObject existing = trackingCache.getIfPresent(ip);
        if (existing == null) {
            return new JsonObject().put("found", false);
        }
        int visits = existing.getInteger("visitCount", 1) + 1;
        existing.put("visitCount", visits);
        trackingCache.put(ip, existing);
        return new JsonObject()
                .put("found", true)
                .put("trackingId", existing.getInteger("trackingId"))
                .put("bits", BITS)
                .put("binary", existing.getString("binary"))
                .put("firstSeen", existing.getString("firstSeen"))
                .put("visitCount", visits);
    }

    /**
     * 返回全局统计
     */
    public JsonObject stats() {
        long total = trackingCache.estimatedSize();
        return new JsonObject()
                .put("trackedUsers", total)
                .put("bits", BITS)
                .put("maxCapacity", 1 << BITS);
    }

    /**
     * 清除指定 IP 的追踪记录（模拟"真正清除 F-Cache"）
     */
    public void evict(String ip) {
        trackingCache.invalidate(ip);
    }

    // ---------- 工具方法 ----------

    protected static String toBinaryString(int num, int bits) {
        StringBuilder sb = new StringBuilder(bits);
        for (int i = bits - 1; i >= 0; i--) {
            sb.append((num >>> i) & 1);
        }
        return sb.toString();
    }

    protected static int fromBinaryString(String binary) {
        int result = 0;
        for (int i = 0; i < binary.length(); i++) {
            result = (result << 1) | (binary.charAt(i) == '1' ? 1 : 0);
        }
        return result;
    }

    private String maskIp(String ip) {
        if (ip == null) return "unknown";
        int lastDot = ip.lastIndexOf('.');
        if (lastDot > 0) return ip.substring(0, lastDot) + ".*";
        return ip;
    }
}
