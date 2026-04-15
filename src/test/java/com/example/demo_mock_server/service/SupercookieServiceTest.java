package com.example.demo_mock_server.service;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SupercookieServiceTest {

    private SupercookieService service;

    @BeforeEach
    void setup() { service = new SupercookieService(); }

    @Test
    void testToBinaryString() {
        assertEquals("00000000", SupercookieService.toBinaryString(0, 8));
        assertEquals("11111111", SupercookieService.toBinaryString(255, 8));
        assertEquals("0000000000101010", SupercookieService.toBinaryString(42, 16));
    }

    @Test
    void testFromBinaryString() {
        assertEquals(0, SupercookieService.fromBinaryString("00000000"));
        assertEquals(255, SupercookieService.fromBinaryString("11111111"));
        assertEquals(42, SupercookieService.fromBinaryString("00101010"));
    }

    @Test
    void testRoundTrip() {
        for (int v : new int[]{0, 1, 42, 255, 1000, 65535}) {
            assertEquals(v, SupercookieService.fromBinaryString(SupercookieService.toBinaryString(v, 16)));
        }
    }

    @Test
    void testCreateWriteSession() {
        String token = service.issueWriteToken();
        JsonObject result = service.beginWriteFlow(token);

        assertNotNull(result);
        int id = result.getInteger("trackingId");
        assertTrue(id > 0);
        assertTrue(id < 65535);
        assertEquals("WRITE", result.getString("mode"));
        assertEquals(16, result.getString("binary").length());
        assertEquals(16, result.getJsonArray("bits").size());
        assertNotNull(result.getString("uid"));
        assertTrue(result.getInteger("firstBitIndex") >= 0);
        assertNull(service.beginWriteFlow(token), "写入 token 应该只能消费一次");
    }

    @Test
    void testStats() {
        service.beginWriteFlow(service.issueWriteToken());
        JsonObject stats = service.stats();
        assertTrue(stats.getLong("trackedUsers") >= 1);
        assertTrue(stats.getLong("activeSessions") >= 1);
        assertEquals(16, stats.getInteger("bits"));
        assertEquals(65536, stats.getInteger("maxCapacity"));
    }

    @Test
    void testReadProbeReconstructsBitPatternFromObservedRequests() {
        JsonObject start = service.beginReadFlow();
        String uid = start.getString("uid");

        for (int i = 0; i < SupercookieService.BITS; i++) {
            String host = "bit" + i + "-numfeel.996.ninja";
            service.registerReadPageVisit(uid, i, host);
            if (i == 1 || i == 3) {
                assertEquals(SupercookieService.FaviconDecision.NOT_FOUND,
                        service.handleFaviconRequest(uid, host, i));
            }
        }

        JsonObject result = service.finalizeSession(uid);
        assertTrue(result.getBoolean("complete"));
        assertEquals("READ", result.getString("mode"));
        assertEquals(5, result.getInteger("trackingId"));
        assertEquals("0000000000000101", result.getString("binary"));
        assertFalse(result.getBoolean("allOne"));
    }

    @Test
    void testRepeatedReadRequestsStayInReadMode() {
        String uid = service.beginReadFlow().getString("uid");
        String host = "bit0-numfeel.996.ninja";

        service.registerReadPageVisit(uid, 0, host);

        assertEquals(SupercookieService.FaviconDecision.NOT_FOUND,
                service.handleFaviconRequest(uid, host, 0));
        assertEquals(SupercookieService.FaviconDecision.NOT_FOUND,
                service.handleFaviconRequest(uid, host, 0));

        JsonObject result = service.finalizeSession(uid);
        assertEquals(1, result.getInteger("networkRequestCount"));
        assertEquals(0, result.getInteger("trackingId"));
        assertFalse(result.getBoolean("allOne"));
    }

    @Test
    void testWriteModeFaviconDecisionMatchesAssignedBits() {
        JsonObject start = service.beginWriteFlow(service.issueWriteToken());
        String uid = start.getString("uid");
        JsonArray bits = start.getJsonArray("bits");

        for (int i = 0; i < SupercookieService.BITS; i++) {
            String host = "bit" + i + "-numfeel.996.ninja";
            service.registerWritePageVisit(uid, i, host);
            SupercookieService.FaviconDecision decision = service.handleFaviconRequest(uid, host, i);
            if (bits.getInteger(i) == 1) {
                assertEquals(SupercookieService.FaviconDecision.CACHEABLE, decision);
            } else {
                assertEquals(SupercookieService.FaviconDecision.NOT_FOUND, decision);
            }
        }
    }
}
