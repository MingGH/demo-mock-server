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
        JsonObject result = service.createWriteSession();
        int id = result.getInteger("trackingId");
        assertEquals(16, result.getString("binary").length());
        JsonArray bits = result.getJsonArray("bits");
        assertEquals(16, bits.size());
        for (int i = 0; i < 16; i++) {
            assertEquals((id >>> (15 - i)) & 1, bits.getInteger(i).intValue());
        }
    }

    @Test
    void testStats() {
        service.createWriteSession();
        JsonObject stats = service.stats();
        assertTrue(stats.getLong("trackedUsers") >= 1);
        assertEquals(16, stats.getInteger("bits"));
        assertEquals(65536, stats.getInteger("maxCapacity"));
    }

    @Test
    void testReadProbeReconstructsBitPatternFromObservedRequests() {
        String probeId = service.startProbeSession().getString("probeId");

        for (int i = 0; i < SupercookieService.BITS; i++) {
            String host = "bit" + i + "-numfeel.996.ninja";
            service.registerReadPageVisit(probeId, i, host);
            if (i == 1 || i == 3) {
                assertFalse(service.handleFaviconRequest(host));
            }
        }

        JsonObject result = service.finishProbeSession(probeId);
        assertTrue(result.getBoolean("complete"));
        assertEquals(5, result.getInteger("trackingId"));
        assertEquals("0000000000000101", result.getString("binary"));
        assertFalse(result.getBoolean("allOne"));
    }

    @Test
    void testRepeatedReadRequestsStayInReadMode() {
        String probeId = service.startProbeSession().getString("probeId");
        String host = "bit0-numfeel.996.ninja";

        service.registerReadPageVisit(probeId, 0, host);

        assertFalse(service.handleFaviconRequest(host));
        assertFalse(service.handleFaviconRequest(host));

        JsonObject result = service.finishProbeSession(probeId);
        assertEquals(1, result.getInteger("networkRequestCount"));
        assertEquals(0, result.getInteger("trackingId"));
        assertFalse(result.getBoolean("allOne"));
    }
}
