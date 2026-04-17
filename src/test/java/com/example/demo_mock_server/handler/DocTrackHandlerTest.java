package com.example.demo_mock_server.handler;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DocTrackHandlerTest {

    @Test
    void maskIp_ipv4_masksLastTwoOctets() {
        assertEquals("192.168.*.*", DocTrackHandler.maskIp("192.168.1.100"));
        assertEquals("10.0.*.*", DocTrackHandler.maskIp("10.0.255.1"));
    }

    @Test
    void maskIp_unknown_returnsUnknown() {
        assertEquals("unknown", DocTrackHandler.maskIp("unknown"));
        assertEquals("unknown", DocTrackHandler.maskIp(null));
    }

    @Test
    void maskIp_ipv6_masksTrailingGroups() {
        String result = DocTrackHandler.maskIp("2001:db8:85a3:0:0:8a2e:370:7334");
        assertTrue(result.startsWith("2001:db8"));
        assertTrue(result.contains("****"));
    }

    @Test
    void parseDevice_iphone() {
        assertEquals("iPhone", DocTrackHandler.parseDevice(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));
    }

    @Test
    void parseDevice_windows() {
        assertEquals("Windows PC", DocTrackHandler.parseDevice(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"));
    }

    @Test
    void parseDevice_mac() {
        assertEquals("Mac", DocTrackHandler.parseDevice(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"));
    }

    @Test
    void parseOs_windows10() {
        assertEquals("Windows 10/11", DocTrackHandler.parseOs(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"));
    }

    @Test
    void parseOs_ios() {
        String result = DocTrackHandler.parseOs(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
        assertTrue(result.startsWith("iOS"));
    }

    @Test
    void parseOs_macos() {
        String result = DocTrackHandler.parseOs(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
        assertTrue(result.startsWith("macOS"));
    }

    @Test
    void parseOs_android() {
        String result = DocTrackHandler.parseOs(
            "Mozilla/5.0 (Linux; Android 13; Pixel 7)");
        assertTrue(result.startsWith("Android"));
    }

    @Test
    void parseDevice_null_returnsUnknown() {
        assertEquals("未知设备", DocTrackHandler.parseDevice(null));
    }

    @Test
    void parseOs_null_returnsUnknown() {
        assertEquals("未知系统", DocTrackHandler.parseOs(null));
    }
}
