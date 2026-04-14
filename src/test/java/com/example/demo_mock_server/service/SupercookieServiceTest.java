package com.example.demo_mock_server.service;

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
    void testAssignNewUser() {
        JsonObject result = service.assign("10.0.0.1");
        assertNotNull(result.getInteger("trackingId"));
        assertEquals(16, result.getInteger("bits"));
        assertEquals(16, result.getString("binary").length());
        assertEquals(1, result.getInteger("visitCount"));
        assertFalse(result.getBoolean("returning"));
    }

    @Test
    void testAssignReturningUser() {
        service.assign("10.0.0.2");
        JsonObject second = service.assign("10.0.0.2");
        assertTrue(second.getBoolean("returning"));
        assertEquals(2, second.getInteger("visitCount"));
    }

    @Test
    void testAssignSameIdForSameIp() {
        JsonObject first = service.assign("10.0.0.3");
        JsonObject second = service.assign("10.0.0.3");
        assertEquals(first.getInteger("trackingId"), second.getInteger("trackingId"));
    }

    @Test
    void testIdentifyUnknown() {
        JsonObject result = service.identify("192.168.99.99");
        assertFalse(result.getBoolean("found"));
    }

    @Test
    void testIdentifyKnown() {
        JsonObject assigned = service.assign("10.0.0.4");
        int id = assigned.getInteger("trackingId");

        JsonObject identified = service.identify("10.0.0.4");
        assertTrue(identified.getBoolean("found"));
        assertEquals(id, identified.getInteger("trackingId"));
    }

    @Test
    void testEvict() {
        service.assign("10.0.0.5");
        service.evict("10.0.0.5");
        JsonObject result = service.identify("10.0.0.5");
        assertFalse(result.getBoolean("found"));
    }

    @Test
    void testStats() {
        // 分配几个不同 IP
        service.assign("10.1.0.1");
        service.assign("10.1.0.2");
        JsonObject stats = service.stats();
        assertTrue(stats.getLong("trackedUsers") >= 2);
        assertEquals(16, stats.getInteger("bits"));
        assertEquals(65536, stats.getInteger("maxCapacity"));
    }
}
