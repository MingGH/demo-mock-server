package run.runnable.numfeelservice.service;

/**
 * 跨界收费站 — 纯统计工具。
 * <p>
 * 与 native 库、FFM 完全解耦，单测不依赖任何本地库。
 */
public final class NativeBenchStats {

    private NativeBenchStats() {
    }

    /**
     * 取中位数（样本为奇数个时取正中，偶数个取中间两数均值）。
     * 基准样本用中位数而不是均值：能抗住某一次 GC 停顿把整轮拉爆的离群值。
     */
    public static long median(long[] samples) {
        if (samples == null || samples.length == 0) {
            throw new IllegalArgumentException("samples must not be empty");
        }
        long[] sorted = samples.clone();
        java.util.Arrays.sort(sorted);
        int mid = sorted.length / 2;
        if (sorted.length % 2 == 1) {
            return sorted[mid];
        }
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * 用实测值估算交叉点：N* = b / (j - v)。
     * j = Java 每次操作耗时，v = C++ 攒批后每次操作耗时，b = 单次过境开销（noop 均摊）。
     * j <= v 时（JIT 后的 Java 不输 C++）没有交叉点，返回 null。
     */
    public static Double crossoverBatch(double javaPerOpNs, double nativeBatchPerOpNs, double tollPerCallNs) {
        if (javaPerOpNs <= 0 || nativeBatchPerOpNs <= 0 || tollPerCallNs < 0) {
            throw new IllegalArgumentException("per-op costs must be positive");
        }
        if (nativeBatchPerOpNs >= javaPerOpNs) {
            return null;
        }
        return tollPerCallNs / (javaPerOpNs - nativeBatchPerOpNs);
    }
}
