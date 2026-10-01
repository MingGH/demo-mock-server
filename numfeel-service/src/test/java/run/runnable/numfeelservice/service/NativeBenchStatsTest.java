package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 跨界收费站统计工具单测。手算值反推，不依赖 native 库。
 */
class NativeBenchStatsTest {

    @Test
    void medianOddCountTakesMiddle() {
        assertEquals(30, NativeBenchStats.median(new long[]{50, 10, 30, 20, 40}));
    }

    @Test
    void medianEvenCountAveragesMiddleTwo() {
        assertEquals(25, NativeBenchStats.median(new long[]{10, 40, 20, 30}));
    }

    @Test
    void medianIgnoresOutlierByDesign() {
        // 一轮 GC 停顿把一个样本拉爆，中位数应当稳如老狗
        long withOutlier = NativeBenchStats.median(new long[]{100, 102, 98, 101, 500_000});
        assertTrue(withOutlier < 150, "median should resist outlier, got " + withOutlier);
    }

    @Test
    void medianRejectsEmptyOrNull() {
        assertThrows(IllegalArgumentException.class, () -> NativeBenchStats.median(new long[0]));
        assertThrows(IllegalArgumentException.class, () -> NativeBenchStats.median(null));
    }

    @Test
    void crossoverMatchesHandComputation() {
        // b=80, j=5, v=5/3 → N* = 80 / (5 - 5/3) = 24
        Double cross = NativeBenchStats.crossoverBatch(5.0, 5.0 / 3, 80.0);
        assertTrue(cross != null && Math.abs(cross - 24.0) < 1e-9, "got " + cross);
    }

    @Test
    void crossoverNullWhenJavaNotSlower() {
        assertNull(NativeBenchStats.crossoverBatch(3.0, 3.0, 80.0));
        assertNull(NativeBenchStats.crossoverBatch(3.0, 4.0, 80.0));
    }

    @Test
    void crossoverRejectsInvalidInput() {
        assertThrows(IllegalArgumentException.class, () -> NativeBenchStats.crossoverBatch(0, 1, 1));
        assertThrows(IllegalArgumentException.class, () -> NativeBenchStats.crossoverBatch(5, 1, -1));
    }
}
