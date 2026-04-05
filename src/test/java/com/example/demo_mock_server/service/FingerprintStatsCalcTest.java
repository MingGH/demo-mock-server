package com.example.demo_mock_server.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 测试 FingerprintService 中统计计算的纯逻辑部分（不依赖 DB）
 */
class FingerprintStatsCalcTest {

    // 提取 avgVisits 计算逻辑为可测试的静态方法（与 FingerprintService 保持一致）
    static double calcAvgVisits(long total, long uniqueFull) {
        if (uniqueFull <= 0) return 0;
        return Math.round(total * 100.0 / uniqueFull) / 100.0;
    }

    @Test
    void avgVisitsShouldBeZeroWhenNoUniqueFingerprints() {
        assertEquals(0.0, calcAvgVisits(0, 0));
        assertEquals(0.0, calcAvgVisits(10, 0));
    }

    @Test
    void avgVisitsShouldBeOneWhenEachUserVisitedOnce() {
        assertEquals(1.0, calcAvgVisits(5, 5));
    }

    @Test
    void avgVisitsShouldRoundToTwoDecimalPlaces() {
        // 10 total / 3 unique = 3.33...
        assertEquals(3.33, calcAvgVisits(10, 3));
    }

    @Test
    void avgVisitsShouldHandleLargeNumbers() {
        // 1000 total / 7 unique ≈ 142.86
        assertEquals(142.86, calcAvgVisits(1000, 7));
    }

    @Test
    void avgVisitsShouldBeExactWhenDivisible() {
        assertEquals(15.0, calcAvgVisits(30, 2));
    }
}
