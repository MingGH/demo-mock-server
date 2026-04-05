package com.example.demo_mock_server.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FingerprintRecordTest {

    private FingerprintRecord sample() {
        return FingerprintRecord.of(
            "abc123hash", "canvasHash", "fontHash", "webglHash",
            "1920x1080@24bit", "Asia/Shanghai", "zh-CN", "MacIntel",
            8, 16, false, 24, 2.0, 52.2, "127.0.0.1"
        );
    }

    @Test
    void factoryMethodShouldPopulateAllFields() {
        FingerprintRecord r = sample();
        assertEquals("abc123hash", r.fullHash());
        assertEquals("canvasHash", r.canvasHash());
        assertEquals("fontHash", r.fontHash());
        assertEquals("webglHash", r.webglHash());
        assertEquals("1920x1080@24bit", r.screenInfo());
        assertEquals("Asia/Shanghai", r.timezone());
        assertEquals("zh-CN", r.language());
        assertEquals("MacIntel", r.platform());
        assertEquals(8, r.hardwareConcurrency());
        assertEquals(16, r.deviceMemory());
        assertFalse(r.touchSupport());
        assertEquals(24, r.colorDepth());
        assertEquals(2.0, r.pixelRatio());
        assertEquals(52.2, r.entropyBits());
        assertEquals("127.0.0.1", r.ipHint());
    }

    @Test
    void touchSupportTrueShouldBePreserved() {
        FingerprintRecord r = FingerprintRecord.of(
            "h", null, null, null, null, null, null, null,
            null, null, true, null, null, null, null
        );
        assertTrue(r.touchSupport());
    }

    @Test
    void nullableFieldsShouldAllowNull() {
        FingerprintRecord r = FingerprintRecord.of(
            "hash", null, null, null, null, null, null, null,
            null, null, false, null, null, null, null
        );
        assertNull(r.canvasHash());
        assertNull(r.fontHash());
        assertNull(r.hardwareConcurrency());
        assertNull(r.deviceMemory());
    }

    @Test
    void recordEqualityShouldBeValueBased() {
        FingerprintRecord a = sample();
        FingerprintRecord b = sample();
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }
}
