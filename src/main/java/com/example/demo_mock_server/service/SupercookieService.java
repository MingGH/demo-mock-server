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
 * 参考开源 demo 的状态机设计，统一管理：
 * 1. launch favicon 触发的写入 token
 * 2. 跨子域共享的访客会话（READ / WRITE）
 * 3. bit 页面访问与 favicon 请求观测结果
 */
public class SupercookieService {

    private static final Logger log = LoggerFactory.getLogger(SupercookieService.class);
    public static final int BITS = 16;
    private static final int MAX_CAPACITY = 1 << BITS;
    private static final int MAX_TRACKING_ID = MAX_CAPACITY - 2; // 保留 0 和全 1
    private static final long SESSION_TTL_MS = 5 * 60_000L;
    private static final long WRITE_TOKEN_TTL_MS = 2 * 60_000L;

    private final Cache<String, Boolean> assignedIds;
    private final Cache<String, Boolean> writeTokens;
    private final Cache<String, VisitorSession> visitorSessions;

    public SupercookieService() {
        this.assignedIds = Caffeine.newBuilder()
                .expireAfterWrite(24, TimeUnit.HOURS)
                .maximumSize(100_000)
                .build();
        this.writeTokens = Caffeine.newBuilder()
                .expireAfterWrite(WRITE_TOKEN_TTL_MS, TimeUnit.MILLISECONDS)
                .maximumSize(10_000)
                .build();
        this.visitorSessions = Caffeine.newBuilder()
                .expireAfterWrite(SESSION_TTL_MS, TimeUnit.MILLISECONDS)
                .maximumSize(10_000)
                .build();
        log.info("SupercookieService initialized ({} bits)", BITS);
    }

    public String issueWriteToken() {
        String token = UUID.randomUUID().toString();
        writeTokens.put(token, true);
        return token;
    }

    public JsonObject beginWriteFlow(String token) {
        if (token == null || writeTokens.getIfPresent(token) == null) {
            return null;
        }
        writeTokens.invalidate(token);

        int trackingId = allocateTrackingId();
        String uid = UUID.randomUUID().toString();
        VisitorSession session = VisitorSession.forWrite(uid, trackingId);
        visitorSessions.put(uid, session);
        assignedIds.put(String.valueOf(trackingId), true);

        log.info("supercookie write flow started: uid={}, trackingId={}", uid, trackingId);
        return session.toStartJson();
    }

    public JsonObject beginReadFlow() {
        String uid = UUID.randomUUID().toString();
        VisitorSession session = VisitorSession.forRead(uid);
        visitorSessions.put(uid, session);
        log.info("supercookie read flow started: uid={}", uid);
        return session.toStartJson();
    }

    public JsonObject registerWritePageVisit(String uid, int bitIndex, String host) {
        VisitorSession session = getSession(uid, SessionMode.WRITE);
        if (session == null || bitIndex < 0 || bitIndex >= BITS) return null;

        String normalizedHost = normalizeHost(host);
        session.touch();
        session.markVisited(bitIndex, normalizedHost);
        log.info("supercookie write page visit: uid={}, host={}, bit={}", uid, normalizedHost, bitIndex);

        return new JsonObject()
                .put("mode", session.mode.name())
                .put("bitIndex", bitIndex)
                .put("nextBitIndex", session.nextWriteBitIndex(bitIndex))
                .put("trackingId", session.trackingId)
                .put("binary", session.binary)
                .put("bits", session.bitsJson());
    }

    public SessionMode getSessionMode(String uid) {
        VisitorSession session = getSession(uid, null);
        return session != null ? session.mode : null;
    }

    public JsonObject registerStepVisit(String uid, int bitIndex, String host) {
        SessionMode mode = getSessionMode(uid);
        if (mode == SessionMode.WRITE) {
            return registerWritePageVisit(uid, bitIndex, host);
        }
        if (mode == SessionMode.READ) {
            return registerReadPageVisit(uid, bitIndex, host);
        }
        return null;
    }

    public JsonObject registerReadPageVisit(String uid, int bitIndex, String host) {
        VisitorSession session = getSession(uid, SessionMode.READ);
        if (session == null || bitIndex < 0 || bitIndex >= BITS) return null;

        String normalizedHost = normalizeHost(host);
        session.touch();
        session.markVisited(bitIndex, normalizedHost);
        log.info("supercookie read page visit: uid={}, host={}, bit={}", uid, normalizedHost, bitIndex);

        int nextBitIndex = bitIndex >= BITS - 1 ? -1 : bitIndex + 1;
        return new JsonObject()
                .put("mode", session.mode.name())
                .put("bitIndex", bitIndex)
                .put("nextBitIndex", nextBitIndex)
                .put("routeCount", BITS);
    }

    public FaviconDecision handleFaviconRequest(String uid, String host, int bitIndex) {
        VisitorSession session = getSession(uid, null);
        if (session == null || bitIndex < 0 || bitIndex >= BITS) {
            return FaviconDecision.NOT_FOUND;
        }

        String normalizedHost = normalizeHost(host);
        session.touch();

        if (session.mode == SessionMode.READ) {
            session.markObservedRequest(bitIndex, normalizedHost);
            log.info("supercookie favicon read hit: uid={}, host={}, bit={}", uid, normalizedHost, bitIndex);
            return FaviconDecision.NOT_FOUND;
        }

        if (session.bitAt(bitIndex) == 1) {
            log.info("supercookie favicon write hit: uid={}, host={}, bit={}", uid, normalizedHost, bitIndex);
            return FaviconDecision.CACHEABLE;
        }

        log.info("supercookie favicon write miss: uid={}, host={}, bit={}", uid, normalizedHost, bitIndex);
        return FaviconDecision.NOT_FOUND;
    }

    public JsonObject finalizeSession(String uid) {
        VisitorSession session = getSession(uid, null);
        if (session == null) {
            return new JsonObject()
                    .put("complete", false)
                    .put("error", "session expired or not found");
        }

        JsonObject result = session.toResultJson();
        visitorSessions.invalidate(uid);
        return result;
    }

    public JsonObject stats() {
        return new JsonObject()
                .put("trackedUsers", assignedIds.estimatedSize())
                .put("activeSessions", visitorSessions.estimatedSize())
                .put("bits", BITS)
                .put("maxCapacity", MAX_CAPACITY)
                .put("usableCapacity", MAX_TRACKING_ID);
    }

    private int allocateTrackingId() {
        for (int i = 0; i < 8; i++) {
            int candidate = ThreadLocalRandom.current().nextInt(1, MAX_TRACKING_ID + 1);
            if (assignedIds.getIfPresent(String.valueOf(candidate)) == null) {
                return candidate;
            }
        }
        return ThreadLocalRandom.current().nextInt(1, MAX_TRACKING_ID + 1);
    }

    private VisitorSession getSession(String uid, SessionMode expectedMode) {
        if (uid == null || uid.isBlank()) return null;
        VisitorSession session = visitorSessions.getIfPresent(uid);
        if (session == null) return null;
        if (System.currentTimeMillis() - session.lastTouchedMs > SESSION_TTL_MS) {
            visitorSessions.invalidate(uid);
            return null;
        }
        if (expectedMode != null && session.mode != expectedMode) {
            return null;
        }
        return session;
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

    public enum SessionMode {
        READ,
        WRITE
    }

    public enum FaviconDecision {
        CACHEABLE,
        NOT_FOUND
    }

    private static final class VisitorSession {
        final String uid;
        final SessionMode mode;
        final int trackingId;
        final String binary;
        final int[] bits;
        final boolean[] visited = new boolean[BITS];
        final boolean[] observedRequests = new boolean[BITS];
        final String[] hosts = new String[BITS];
        long lastTouchedMs;

        private VisitorSession(String uid, SessionMode mode, int trackingId) {
            this.uid = uid;
            this.mode = mode;
            this.trackingId = trackingId;
            this.binary = mode == SessionMode.WRITE ? toBinaryString(trackingId, BITS) : "";
            this.bits = new int[BITS];
            if (mode == SessionMode.WRITE) {
                for (int i = 0; i < BITS; i++) {
                    bits[i] = (trackingId >>> (BITS - 1 - i)) & 1;
                }
            }
            this.lastTouchedMs = System.currentTimeMillis();
        }

        static VisitorSession forWrite(String uid, int trackingId) {
            return new VisitorSession(uid, SessionMode.WRITE, trackingId);
        }

        static VisitorSession forRead(String uid) {
            return new VisitorSession(uid, SessionMode.READ, 0);
        }

        synchronized void touch() {
            lastTouchedMs = System.currentTimeMillis();
        }

        synchronized void markVisited(int bitIndex, String host) {
            visited[bitIndex] = true;
            hosts[bitIndex] = host;
        }

        synchronized void markObservedRequest(int bitIndex, String host) {
            observedRequests[bitIndex] = true;
            hosts[bitIndex] = host;
        }

        synchronized int bitAt(int bitIndex) {
            return bits[bitIndex];
        }

        synchronized int nextWriteBitIndex(int currentBitIndex) {
            for (int i = currentBitIndex + 1; i < BITS; i++) {
                if (bits[i] == 1) return i;
            }
            return -1;
        }

        synchronized int firstWriteBitIndex() {
            return nextWriteBitIndex(-1);
        }

        synchronized JsonArray bitsJson() {
            JsonArray bits = new JsonArray();
            for (int bit : this.bits) bits.add(bit);
            return bits;
        }

        synchronized JsonObject toStartJson() {
            JsonObject json = new JsonObject()
                    .put("uid", uid)
                    .put("mode", mode.name())
                    .put("routeCount", BITS);

            if (mode == SessionMode.WRITE) {
                json.put("trackingId", trackingId)
                        .put("binary", binary)
                        .put("bits", bitsJson())
                        .put("firstBitIndex", firstWriteBitIndex());
            } else {
                json.put("firstBitIndex", 0);
            }
            return json;
        }

        synchronized JsonObject toResultJson() {
            JsonArray bitArray = new JsonArray();
            JsonArray observedArray = new JsonArray();
            JsonArray visitedBits = new JsonArray();

            int visitedCount = 0;
            int networkRequestCount = 0;
            int reconstructedId = 0;
            int expectedVisitedCount = 0;

            for (int i = 0; i < BITS; i++) {
                if (visited[i]) visitedCount++;
                int bit = mode == SessionMode.WRITE ? bits[i] : (observedRequests[i] ? 0 : 1);
                if (mode == SessionMode.WRITE && bits[i] == 1) expectedVisitedCount++;
                if (observedRequests[i]) networkRequestCount++;

                bitArray.add(bit);
                observedArray.add(observedRequests[i]);
                visitedBits.add(visited[i]);
                reconstructedId = (reconstructedId << 1) | bit;
            }

            boolean complete = mode == SessionMode.WRITE
                    ? visitedCount == expectedVisitedCount
                    : visitedCount == BITS;

            return new JsonObject()
                    .put("uid", uid)
                    .put("mode", mode.name())
                    .put("complete", complete)
                    .put("visitedCount", visitedCount)
                    .put("expectedVisitedCount", mode == SessionMode.WRITE ? expectedVisitedCount : BITS)
                    .put("networkRequestCount", networkRequestCount)
                    .put("trackingId", mode == SessionMode.WRITE ? trackingId : reconstructedId)
                    .put("binary", mode == SessionMode.WRITE ? binary : toBinaryString(reconstructedId, BITS))
                    .put("bits", bitArray)
                    .put("visitedBits", visitedBits)
                    .put("observedRequests", observedArray)
                    .put("firstVisit", mode == SessionMode.WRITE)
                    .put("allZero", (mode == SessionMode.WRITE ? trackingId : reconstructedId) == 0)
                    .put("allOne", (mode == SessionMode.WRITE ? trackingId : reconstructedId) == (MAX_CAPACITY - 1));
        }
    }
}
