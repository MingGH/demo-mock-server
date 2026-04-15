package com.example.demo_mock_server.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * Favicon Supercookie 追踪服务。
 * 负责：
 * 1. 分配追踪 ID
 * 2. 管理读取 probe 会话
 * 3. 关联 "页面访问上下文" 和 "favicon 请求是否到达"
 */
public class SupercookieService {

    private static final Logger log = LoggerFactory.getLogger(SupercookieService.class);
    public static final int BITS = 16;
    private static final int MAX_CAPACITY = 1 << BITS;
    private static final int MAX_TRACKING_ID = MAX_CAPACITY - 2; // 保留 0 和全 1
    private static final long PROBE_WINDOW_MS = 4_000L;

    private final Cache<String, Boolean> assignedIds;
    private final Cache<String, ProbeSession> probeSessions;
    private final Cache<String, PageContext> pageContextsByHost;

    public SupercookieService() {
        this.assignedIds = Caffeine.newBuilder()
                .expireAfterWrite(24, TimeUnit.HOURS)
                .maximumSize(100_000)
                .build();
        this.probeSessions = Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(10_000)
                .build();
        this.pageContextsByHost = Caffeine.newBuilder()
                .expireAfterWrite(PROBE_WINDOW_MS, TimeUnit.MILLISECONDS)
                .maximumSize(10_000)
                .build();
        log.info("SupercookieService initialized ({} bits)", BITS);
    }

    public JsonObject createWriteSession() {
        int trackingId = ThreadLocalRandom.current().nextInt(1, MAX_TRACKING_ID + 1);
        String binary = toBinaryString(trackingId, BITS);
        JsonArray bitsArray = new JsonArray();
        for (int i = 0; i < BITS; i++) {
            bitsArray.add((trackingId >>> (BITS - 1 - i)) & 1);
        }
        assignedIds.put(String.valueOf(trackingId), true);
        return new JsonObject()
                .put("trackingId", trackingId)
                .put("binary", binary)
                .put("bits", bitsArray);
    }

    public JsonObject startProbeSession() {
        String probeId = UUID.randomUUID().toString();
        probeSessions.put(probeId, new ProbeSession(probeId));
        return new JsonObject()
                .put("probeId", probeId)
                .put("bits", BITS)
                .put("windowMs", PROBE_WINDOW_MS);
    }

    public void registerReadPageVisit(String probeId, int bitIndex, String host) {
        ProbeSession session = probeSessions.getIfPresent(probeId);
        if (session == null || bitIndex < 0 || bitIndex >= BITS) return;

        String normalizedHost = normalizeHost(host);
        session.markVisited(bitIndex, normalizedHost);
        pageContextsByHost.put(normalizedHost, new PageContext(PageMode.READ, probeId, bitIndex, System.currentTimeMillis()));
        log.info("supercookie probe page visit: probeId={}, host={}, bit={}", probeId, normalizedHost, bitIndex);
    }

    public void registerWritePageVisit(int bitIndex, String host) {
        String normalizedHost = normalizeHost(host);
        if (bitIndex < 0 || bitIndex >= BITS) return;
        pageContextsByHost.put(normalizedHost, new PageContext(PageMode.WRITE, null, bitIndex, System.currentTimeMillis()));
        log.info("supercookie write page visit: host={}, bit={}", normalizedHost, bitIndex);
    }

    public boolean handleFaviconRequest(String host) {
        String normalizedHost = normalizeHost(host);
        PageContext context = pageContextsByHost.getIfPresent(normalizedHost);
        if (context == null) {
            return true;
        }

        if (System.currentTimeMillis() - context.timestampMs > PROBE_WINDOW_MS) {
            pageContextsByHost.invalidate(normalizedHost);
            return true;
        }

        if (context.mode == PageMode.READ) {
            ProbeSession session = probeSessions.getIfPresent(context.probeId);
            if (session != null) {
                session.markFaviconRequested(context.bitIndex);
                log.info("supercookie favicon read hit: probeId={}, host={}, bit={}", context.probeId, normalizedHost, context.bitIndex);
            }
            return false;
        }

        pageContextsByHost.invalidate(normalizedHost);
        log.info("supercookie favicon write hit: host={}, bit={}", normalizedHost, context.bitIndex);
        return true;
    }

    public JsonObject finishProbeSession(String probeId) {
        ProbeSession session = probeSessions.getIfPresent(probeId);
        if (session == null) {
            return new JsonObject()
                    .put("probeId", probeId)
                    .put("complete", false)
                    .put("error", "probe session expired or not found");
        }

        JsonObject result = session.toJson();
        probeSessions.invalidate(probeId);
        return result;
    }

    public JsonObject stats() {
        return new JsonObject()
                .put("trackedUsers", assignedIds.estimatedSize())
                .put("bits", BITS)
                .put("maxCapacity", MAX_CAPACITY)
                .put("usableCapacity", MAX_TRACKING_ID);
    }

    protected static String toBinaryString(int num, int bits) {
        StringBuilder sb = new StringBuilder(bits);
        for (int i = bits - 1; i >= 0; i--) sb.append((num >>> i) & 1);
        return sb.toString();
    }

    protected static int fromBinaryString(String binary) {
        int result = 0;
        for (int i = 0; i < binary.length(); i++)
            result = (result << 1) | (binary.charAt(i) == '1' ? 1 : 0);
        return result;
    }

    private static String normalizeHost(String host) {
        if (host == null) return "";
        String normalized = host.toLowerCase();
        int colon = normalized.indexOf(':');
        return colon >= 0 ? normalized.substring(0, colon) : normalized;
    }

    private enum PageMode {
        READ,
        WRITE
    }

    private static final class PageContext {
        final PageMode mode;
        final String probeId;
        final int bitIndex;
        final long timestampMs;

        PageContext(PageMode mode, String probeId, int bitIndex, long timestampMs) {
            this.mode = mode;
            this.probeId = probeId;
            this.bitIndex = bitIndex;
            this.timestampMs = timestampMs;
        }
    }

    private static final class ProbeSession {
        final String probeId;
        final boolean[] visited = new boolean[BITS];
        final boolean[] faviconRequested = new boolean[BITS];
        final String[] hosts = new String[BITS];

        ProbeSession(String probeId) {
            this.probeId = probeId;
        }

        synchronized void markVisited(int bitIndex, String host) {
            visited[bitIndex] = true;
            hosts[bitIndex] = host;
        }

        synchronized void markFaviconRequested(int bitIndex) {
            faviconRequested[bitIndex] = true;
        }

        synchronized JsonObject toJson() {
            JsonArray bits = new JsonArray();
            JsonArray observedRequests = new JsonArray();
            JsonArray visitedBits = new JsonArray();

            int visitedCount = 0;
            int networkRequestCount = 0;
            int trackingId = 0;

            for (int i = 0; i < BITS; i++) {
                if (visited[i]) visitedCount++;
                int bit = faviconRequested[i] ? 0 : 1;
                if (faviconRequested[i]) networkRequestCount++;

                bits.add(bit);
                observedRequests.add(faviconRequested[i]);
                visitedBits.add(visited[i]);
                trackingId = (trackingId << 1) | bit;
            }

            return new JsonObject()
                    .put("probeId", probeId)
                    .put("complete", visitedCount == BITS)
                    .put("visitedCount", visitedCount)
                    .put("networkRequestCount", networkRequestCount)
                    .put("trackingId", trackingId)
                    .put("binary", toBinaryString(trackingId, BITS))
                    .put("bits", bits)
                    .put("visitedBits", visitedBits)
                    .put("observedRequests", observedRequests)
                    .put("allZero", trackingId == 0)
                    .put("allOne", trackingId == (MAX_CAPACITY - 1));
        }
    }
}
