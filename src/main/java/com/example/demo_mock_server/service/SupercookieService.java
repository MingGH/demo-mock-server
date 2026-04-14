package com.example.demo_mock_server.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * Favicon Supercookie 追踪服务 — 真正基于 F-Cache 原理。
 *
 * 写入阶段：分配 ID → 前端用 img 请求 bitN 子域名 → 后端按 bit 值控制缓存头
 * 读取阶段：前端再次请求所有子域名 → 有缓存的不到达服务器(=1)，无缓存的到达(=0)
 */
public class SupercookieService {

    private static final Logger log = LoggerFactory.getLogger(SupercookieService.class);
    static final int BITS = 16;

    /** 写入 session: token → { trackingId, bits[], createdAt } */
    private final Cache<String, JsonObject> writeSessionCache;

    /** 探测 session: token → { probeHits: boolean[16], createdAt } */
    private final Cache<String, JsonObject> probeSessionCache;

    /** 全局统计：已分配的追踪 ID 数 */
    private final Cache<String, Boolean> assignedIds;

    public SupercookieService() {
        this.writeSessionCache = Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(10_000)
                .build();
        this.probeSessionCache = Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(10_000)
                .build();
        this.assignedIds = Caffeine.newBuilder()
                .expireAfterWrite(24, TimeUnit.HOURS)
                .maximumSize(100_000)
                .build();
        log.info("SupercookieService initialized (F-Cache mode, {} bits)", BITS);
    }

    /**
     * 创建写入 session：分配随机 ID，返回 token + bits
     */
    public JsonObject createWriteSession() {
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        int trackingId = ThreadLocalRandom.current().nextInt(0, (1 << BITS));
        String binary = toBinaryString(trackingId, BITS);
        int[] bits = new int[BITS];
        for (int i = 0; i < BITS; i++) {
            bits[i] = (trackingId >>> (BITS - 1 - i)) & 1;
        }

        JsonArray bitsArray = new JsonArray();
        for (int b : bits) bitsArray.add(b);

        JsonObject session = new JsonObject()
                .put("trackingId", trackingId)
                .put("binary", binary)
                .put("bits", bitsArray)
                .put("createdAt", Instant.now().toString());

        writeSessionCache.put(token, session);
        assignedIds.put(String.valueOf(trackingId), true);

        return new JsonObject()
                .put("token", token)
                .put("trackingId", trackingId)
                .put("binary", binary)
                .put("bits", bitsArray);
    }

    /**
     * Favicon 请求（写入阶段）：根据 token + bitIndex 返回该 bit 的值。
     * 前端用 img 请求，后端根据返回值设置缓存头。
     *
     * @return bit 值 (0 或 1)，-1 表示 token 无效
     */
    public int getFaviconBit(String token, int bitIndex) {
        if (bitIndex < 0 || bitIndex >= BITS) return -1;
        JsonObject session = writeSessionCache.getIfPresent(token);
        if (session == null) return -1;
        return session.getJsonArray("bits").getInteger(bitIndex);
    }

    /**
     * 创建探测 session：用于读取阶段
     */
    public JsonObject createProbeSession() {
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        JsonArray hits = new JsonArray();
        for (int i = 0; i < BITS; i++) hits.add(false);

        JsonObject session = new JsonObject()
                .put("probeHits", hits)
                .put("createdAt", Instant.now().toString());

        probeSessionCache.put(token, session);
        return new JsonObject().put("token", token);
    }

    /**
     * 探测请求到达：记录该 bit 被请求了（= 没有缓存 = 0）
     *
     * @return true 如果记录成功
     */
    public boolean recordProbeHit(String token, int bitIndex) {
        if (bitIndex < 0 || bitIndex >= BITS) return false;
        JsonObject session = probeSessionCache.getIfPresent(token);
        if (session == null) return false;
        session.getJsonArray("probeHits").set(bitIndex, true);
        probeSessionCache.put(token, session);
        return true;
    }

    /**
     * 汇总探测结果：请求到达 = 没缓存 = 0，没到达 = 有缓存 = 1
     */
    public JsonObject resolveProbe(String token) {
        JsonObject session = probeSessionCache.getIfPresent(token);
        if (session == null) {
            return new JsonObject().put("found", false).put("error", "session_expired");
        }

        JsonArray probeHits = session.getJsonArray("probeHits");
        int trackingId = 0;
        StringBuilder binary = new StringBuilder();
        for (int i = 0; i < BITS; i++) {
            boolean hit = probeHits.getBoolean(i);
            // hit = 请求到达服务器 = 没缓存 = bit 0
            // !hit = 没到达 = 有缓存 = bit 1
            int bit = hit ? 0 : 1;
            trackingId = (trackingId << 1) | bit;
            binary.append(bit);
        }

        // 清理 session
        probeSessionCache.invalidate(token);

        return new JsonObject()
                .put("found", true)
                .put("trackingId", trackingId)
                .put("binary", binary.toString())
                .put("bits", BITS);
    }

    /**
     * 全局统计
     */
    public JsonObject stats() {
        long total = assignedIds.estimatedSize();
        return new JsonObject()
                .put("trackedUsers", total)
                .put("bits", BITS)
                .put("maxCapacity", 1 << BITS);
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
}
