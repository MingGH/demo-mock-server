package com.example.demo_mock_server.service;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SupercookieServiceTest {

    private SupercookieService service;

    @BeforeEach
    void setup() {
        service = new SupercookieService();
    }

    @Test
    void testToBinaryString() {
        assertEquals("00000000", SupercookieService.toBinaryString(0, 8));
        assertEquals("11111111", SupercookieService.toBinaryString(255, 8));
        assertEquals("00101010", SupercookieService.toBinaryString(42, 8));
        assertEquals("0000000000101010", SupercookieService.toBinaryString(42, 16));
        assertEquals("1111111111111111", SupercookieService.toBinaryString(65535, 16));
    }

    @Test
    void testFromBinaryString() {
        assertEquals(0, SupercookieService.fromBinaryString("00000000"));
        assertEquals(255, SupercookieService.fromBinaryString("11111111"));
        assertEquals(42, SupercookieService.fromBinaryString("00101010"));
        assertEquals(65535, SupercookieService.fromBinaryString("1111111111111111"));
    }

    @Test
    void testRoundTrip() {
        int[] values = {0, 1, 42, 127, 255, 1000, 65535};
        for (int v : values) {
            String binary = SupercookieService.toBinaryString(v, 16);
            int recovered = SupercookieService.fromBinaryString(binary);
            assertEquals(v, recovered, "Round-trip failed for " + v);
        }
    }

    @Test
    void testCreateWriteSession() {
        JsonObject result = service.createWriteSession();
        assertNotNull(result.getString("token"));
        assertNotNull(result.getInteger("trackingId"));
        assertEquals(16, result.getString("binary").length());
        JsonArray bits = result.getJsonArray("bits");
        assertEquals(16, bits.size());
        // bits should be 0 or 1
        for (int i = 0; i < 16; i++) {
            int b = bits.getInteger(i);
            assertTrue(b == 0 || b == 1);
        }
    }

    @Test
    void testGetFaviconBit() {
        JsonObject session = service.createWriteSession();
        String token = session.getString("token");
        JsonArray bits = session.getJsonArray("bits");

        for (int i = 0; i < 16; i++) {
            assertEquals(bits.getInteger(i).intValue(), service.getFaviconBit(token, i));
        }
        // invalid token
        assertEquals(-1, service.getFaviconBit("invalid", 0));
        // invalid index
        assertEquals(-1, service.getFaviconBit(token, -1));
        assertEquals(-1, service.getFaviconBit(token, 16));
    }

    @Test
    void testProbeSessionAndResolve() {
        // Create a write session to know the ID
        JsonObject writeSession = service.createWriteSession();
        int trackingId = writeSession.getInteger("trackingId");
        JsonArray bits = writeSession.getJsonArray("bits");

        // Create probe session
        JsonObject probeSession = service.createProbeSession();
        String probeToken = probeSession.getString("token");

        // Simulate: for bits that are 0, the request reaches the server (no cache)
        // For bits that are 1, the request does NOT reach the server (cached)
        for (int i = 0; i < 16; i++) {
            if (bits.getInteger(i) == 0) {
                // bit=0 means no cache, request reaches server
                assertTrue(service.recordProbeHit(probeToken, i));
            }
            // bit=1 means cached, request does NOT reach server → no recordProbeHit call
        }

        // Resolve
        JsonObject result = service.resolveProbe(probeToken);
        assertTrue(result.getBoolean("found"));
        assertEquals(trackingId, result.getInteger("trackingId").intValue());
    }

    @Test
    void testProbeSessionExpired() {
        JsonObject result = service.resolveProbe("nonexistent");
        assertFalse(result.getBoolean("found"));
    }

    @Test
    void testStats() {
        service.createWriteSession();
        service.createWriteSession();
        JsonObject stats = service.stats();
        assertTrue(stats.getLong("trackedUsers") >= 2);
        assertEquals(16, stats.getInteger("bits"));
        assertEquals(65536, stats.getInteger("maxCapacity"));
    }
}
