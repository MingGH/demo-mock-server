package com.example.demo_mock_server.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * Favicon Supercookie 追踪服务。
 * 只负责分配 ID 和统计，读取逻辑完全在前端完成。
 */
public class SupercookieService {

    private static final Logger log = LoggerFactory.getLogger(SupercookieService.class);
    static final int BITS = 16;

    private final Cache<String, Boolean> assignedIds;

    public SupercookieService() {
        this.assignedIds = Caffeine.newBuilder()
                .expireAfterWrite(24, TimeUnit.HOURS)
                .maximumSize(100_000)
                .build();
        log.info("SupercookieService initialized ({} bits)", BITS);
    }

    public JsonObject createWriteSession() {
        int trackingId = ThreadLocalRandom.current().nextInt(0, (1 << BITS));
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

    public JsonObject stats() {
        return new JsonObject()
                .put("trackedUsers", assignedIds.estimatedSize())
                .put("bits", BITS)
                .put("maxCapacity", 1 << BITS);
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
}
