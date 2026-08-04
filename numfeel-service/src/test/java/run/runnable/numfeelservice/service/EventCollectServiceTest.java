package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.EventRequests.EventItem;
import run.runnable.numfeelservice.controller.dto.EventResponses.EventCollectResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.r2dbc.core.DatabaseClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventCollectServiceTest {

    @Mock
    private DatabaseClient databaseClient;

    private static final String SALT = "test-salt";

    private EventCollectService newService(boolean enabled) {
        return new EventCollectService(databaseClient, enabled, SALT);
    }

    @Test
    @SuppressWarnings("unchecked")
    void collect_disabled_returnsAcceptedZeroWithoutTouchingDatabase() {
        EventCollectService service = newService(false);
        EventItem item = new EventItem("press", 1, System.currentTimeMillis(), Map.of("idx", 1));

        StepVerifier.create(service.collect("demo-x", "session12345678", List.of(item), "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(0, resp.accepted());
                    assertEquals(0, resp.dropped());
                })
                .verifyComplete();

        verifyNoInteractions(databaseClient);
    }

    @Test
    void collect_emptyEvents_returnsZeroAccepted() {
        EventCollectService service = newService(true);

        StepVerifier.create(service.collect("demo-x", "session12345678", List.of(), "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(0, resp.accepted());
                    assertEquals(0, resp.dropped());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void collect_illegalEventName_isDroppedNotWholeBatch() {
        EventCollectService service = newService(true);
        mockSuccessfulInsert();

        EventItem valid = new EventItem("press", 1, System.currentTimeMillis(), Map.of("idx", 1));
        EventItem invalidUppercase = new EventItem("Press", 2, System.currentTimeMillis(), Map.of());
        EventItem invalidSymbol = new EventItem("press-x", 3, System.currentTimeMillis(), Map.of());
        EventItem nullName = new EventItem(null, 4, System.currentTimeMillis(), Map.of());

        StepVerifier.create(service.collect("demo-x", "session12345678",
                        List.of(valid, invalidUppercase, invalidSymbol, nullName), "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(1, resp.accepted());
                    assertEquals(3, resp.dropped());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void collect_allEventsInvalid_noInsertAttempted() {
        EventCollectService service = newService(true);
        EventItem invalid = new EventItem("BAD", 1, System.currentTimeMillis(), Map.of());

        StepVerifier.create(service.collect("demo-x", "session12345678", List.of(invalid), "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(0, resp.accepted());
                    assertEquals(1, resp.dropped());
                })
                .verifyComplete();

        verifyNoInteractions(databaseClient);
    }

    @Test
    @SuppressWarnings("unchecked")
    void collect_insertFailure_treatsAllAsDropped() {
        EventCollectService service = newService(true);
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(databaseClient.sql(anyString())).thenReturn(spec);
        when(spec.bind(anyInt(), any())).thenReturn(spec);
        when(spec.bindNull(anyInt(), any(Class.class))).thenReturn(spec);
        org.springframework.r2dbc.core.FetchSpec<java.util.Map<String, Object>> fetchSpec =
                mock(org.springframework.r2dbc.core.FetchSpec.class);
        when(spec.fetch()).thenReturn(fetchSpec);
        when(fetchSpec.rowsUpdated()).thenReturn(Mono.error(new RuntimeException("DB down")));

        // props 为空 map，序列化结果为 null，会触发 bindNull 那一支路径
        EventItem item = new EventItem("press", 1, System.currentTimeMillis(), Map.of());

        StepVerifier.create(service.collect("demo-x", "session12345678", List.of(item), "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(0, resp.accepted());
                    assertEquals(1, resp.dropped());
                })
                .verifyComplete();
    }

    // ── cleanProps ──────────────────────────────────────────────────────

    @Test
    void cleanProps_keepsNumberBooleanShortString() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("idx", 5);
        raw.put("win", true);
        raw.put("mode", "standard");

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertEquals(5, cleaned.get("idx"));
        assertEquals(true, cleaned.get("win"));
        assertEquals("standard", cleaned.get("mode"));
    }

    @Test
    void cleanProps_dropsNestedObjectsAndArrays() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("nested", Map.of("a", 1));
        raw.put("array", List.of(1, 2, 3));
        raw.put("ok", 1);

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertFalse(cleaned.containsKey("nested"));
        assertFalse(cleaned.containsKey("array"));
        assertEquals(1, cleaned.get("ok"));
    }

    @Test
    void cleanProps_dropsStringLongerThan64Chars() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("short", "ok");
        raw.put("long", "x".repeat(65));

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertEquals("ok", cleaned.get("short"));
        assertFalse(cleaned.containsKey("long"));
    }

    @Test
    void cleanProps_capsAtMax20Keys() {
        Map<String, Object> raw = new LinkedHashMap<>();
        for (int i = 0; i < 30; i++) {
            raw.put("k" + i, i);
        }

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertTrue(cleaned.size() <= 20);
    }

    @Test
    void cleanProps_singleValueTripsByteLimit_thatKeyDroppedOthersKept() {
        // 前面已接近 1024 字节上限，此时加入一个超大字符串值会超限 → 该 key 被丢弃，
        // 但已接受的 key 保留，且后续仍会继续尝试更小的 key（continue 而非 break）。
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("small", "ok");
        for (int i = 0; i < 20; i++) {
            raw.put("k" + i, "v".repeat(64));
        }
        raw.put("big", "z".repeat(64));

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertEquals("ok", cleaned.get("small"));
        assertFalse(cleaned.containsKey("big"), "超限的 key 应被丢弃");
        assertTrue(cleaned.size() <= 20);
    }

    @Test
    void cleanProps_multipleMediumKeys_accumulateOverLimit_laterDroppedKeptUnchanged() {
        // 多个中等 key 累加超限 → 后续 key 被丢弃，且已接受的 key 保持不变（不被回滚）
        Map<String, Object> raw = new LinkedHashMap<>();
        for (int i = 0; i < 30; i++) {
            raw.put("k" + i, "v".repeat(64));
        }

        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);

        assertTrue(cleaned.size() < 30, "超限后应丢弃部分 key");
        // 已接受的 key 必须原样保留
        for (String key : cleaned.keySet()) {
            assertEquals("v".repeat(64), cleaned.get(key));
        }
    }

    @Test
    void cleanProps_byteLimitRespected_serializedSizeUnder1024() {
        Map<String, Object> raw = new LinkedHashMap<>();
        for (int i = 0; i < 25; i++) {
            raw.put("k" + i, "v".repeat(64));
        }
        Map<String, Object> cleaned = EventCollectService.cleanProps(raw);
        // 用 Jackson 序列化后的字节数验证真正落在 1024 以内
        String json = new tools.jackson.databind.ObjectMapper().writeValueAsString(cleaned);
        assertTrue(json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 1024,
                "cleaned props 应控制在 1024 字节以内, 实际 " + json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
    }

    @Test
    void cleanProps_nullOrEmptyInput_returnsEmptyMap() {
        assertTrue(EventCollectService.cleanProps(null).isEmpty());
        assertTrue(EventCollectService.cleanProps(Map.of()).isEmpty());
    }

    // ── normalizeClientTs ───────────────────────────────────────────────

    @Test
    void normalizeClientTs_nullDefaultsToZero() {
        assertEquals(0L, EventCollectService.normalizeClientTs(null, System.currentTimeMillis()));
    }

    @Test
    void normalizeClientTs_withinSkew_keepsValue() {
        long now = System.currentTimeMillis();
        assertEquals(now - 1000, EventCollectService.normalizeClientTs(now - 1000, now));
    }

    @Test
    void normalizeClientTs_beyond24Hours_resetsToZero() {
        long now = System.currentTimeMillis();
        long tooOld = now - 25L * 60 * 60 * 1000;
        assertEquals(0L, EventCollectService.normalizeClientTs(tooOld, now));
    }

    // ── ip_hash ─────────────────────────────────────────────────────────

    @Test
    void computeIpHash_doesNotContainRawIp() {
        EventCollectService service = newService(true);
        String ip = "203.0.113.42";
        String hash = service.computeIpHash(ip, System.currentTimeMillis());

        assertFalse(hash.contains(ip));
        assertEquals(16, hash.length());
    }

    @Test
    void computeIpHash_sameIpSameDay_producesSameHash() {
        EventCollectService service = newService(true);
        long now = System.currentTimeMillis();
        String hash1 = service.computeIpHash("1.2.3.4", now);
        String hash2 = service.computeIpHash("1.2.3.4", now + 1000);

        assertEquals(hash1, hash2);
    }

    @Test
    void computeIpHash_differentIp_producesDifferentHash() {
        EventCollectService service = newService(true);
        long now = System.currentTimeMillis();
        String hash1 = service.computeIpHash("1.2.3.4", now);
        String hash2 = service.computeIpHash("5.6.7.8", now);

        assertNotEquals(hash1, hash2);
    }

    @SuppressWarnings("unchecked")
    private void mockSuccessfulInsert() {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(databaseClient.sql(anyString())).thenReturn(spec);
        when(spec.bind(anyInt(), any())).thenReturn(spec);
        // 只有 props 为空 (null) 时才会走 bindNull，用 lenient 避免个别用例里此 stub 未被触发导致误报
        lenient().when(spec.bindNull(anyInt(), any(Class.class))).thenReturn(spec);
        org.springframework.r2dbc.core.FetchSpec<java.util.Map<String, Object>> fetchSpec =
                mock(org.springframework.r2dbc.core.FetchSpec.class);
        when(spec.fetch()).thenReturn(fetchSpec);
        when(fetchSpec.rowsUpdated()).thenReturn(Mono.just(1L));
    }
}
