package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.controller.dto.UtilityRequests;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TransportLabService 核心计算逻辑测试。
 */
class TransportLabServiceTest {

    private final TransportLabService service = new TransportLabService();

    @Test
    void high_frequency_recommends_websocket() {
        var query = new UtilityRequests.TransportLabQuery("240", "320", "180", "800", "2", "1");
        var res = service.snapshot(query);

        assertEquals("websocket", res.recommendation());
        assertEquals(720, res.eventCount());
        assertEquals(90, res.pollCount());
        assertTrue(res.websocket().bytes() > res.http().bytes(),
                "高频场景下 WebSocket 单连接摊销后总流量低于 HTTP 轮询");
        assertTrue(res.websocket().latencyMs() < res.http().latencyMs(),
                "WebSocket 延迟应显著低于 HTTP 轮询");
    }

    @Test
    void sparse_interaction_recommends_http() {
        var query = new UtilityRequests.TransportLabQuery("1", "1600", "120", "1200", "30", "0");
        var res = service.snapshot(query);

        assertEquals("http", res.recommendation());
        assertEquals(2, res.eventCount());
        assertEquals(4, res.pollCount());
        assertTrue(res.websocket().memoryMb() > res.http().memoryMb(),
                "稀疏交互下 WebSocket 内存占用应高于 HTTP");
    }

    @Test
    void mixed_recommendation_exists() {
        var query = new UtilityRequests.TransportLabQuery("30", "500", "300", "1500", "5", "2");
        var res = service.snapshot(query);

        assertEquals("mixed", res.recommendation());
        assertNotNull(res.reason());
        assertTrue(res.reason().contains("两边"));
    }

    @Test
    void null_query_uses_defaults() {
        var res = service.snapshot(null);

        assertNotNull(res.recommendation());
        assertTrue(res.eventCount() > 0);
        assertTrue(res.pollCount() > 0);
        assertNotNull(res.http());
        assertNotNull(res.websocket());
        assertNotNull(res.summary());
    }

    @Test
    void blank_fields_use_defaults() {
        var query = new UtilityRequests.TransportLabQuery("", "", "", "", "", "");
        var res = service.snapshot(query);

        assertEquals(180, res.eventCount());
        assertEquals(36, res.pollCount());
    }

    @Test
    void invalid_strings_use_defaults() {
        var query = new UtilityRequests.TransportLabQuery("abc", "-100", "999999", "100", "abc", "xyz");
        var res = service.snapshot(query);

        // eventsPerMinute 非法 → 默认 60；activeSeconds 超限 →  Clamp 到 3600
        assertEquals(3600, res.eventCount());
        assertTrue(res.websocket().memoryMb() > 0);
    }

    @Test
    void values_are_clamped() {
        var query = new UtilityRequests.TransportLabQuery("5000", "50000", "7200", "100000", "120", "50");
        var res = service.snapshot(query);

        // eventsPerMinute Clamp 到 1000，activeSeconds Clamp 到 3600
        assertEquals(60000, res.eventCount());
        assertTrue(res.websocket().memoryMb() > 0);
    }

    @Test
    void summary_percentages_are_reasonable() {
        var query = new UtilityRequests.TransportLabQuery("240", "320", "180", "800", "2", "1");
        var res = service.snapshot(query);
        var summary = res.summary();

        assertTrue(summary.wsBytesSavedPercent() >= -1000 && summary.wsBytesSavedPercent() <= 1000,
                "流量节省百分比应在合理范围");
        assertTrue(summary.wsMemoryPenaltyPercent() >= -1000 && summary.wsMemoryPenaltyPercent() <= 1000,
                "内存惩罚百分比应在合理范围");
    }
}
