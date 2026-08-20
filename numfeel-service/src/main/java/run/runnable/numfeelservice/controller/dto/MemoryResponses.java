package run.runnable.numfeelservice.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * JVM 内存解剖接口的响应 DTO。
 * <p>
 * 返回的是「这个正在运行的服务自己」的内存快照，用来回答：
 * 一个 Spring Boot 服务里，业务代码只占了多大，剩下的是不是「环境税」。
 */
public final class MemoryResponses {

    private MemoryResponses() {
    }

    /**
     * 单个垃圾收集器的累计统计。
     *
     * @param name GC 名称（如 G1 Young Generation / G1 Old Generation）
     * @param collections 已发生的收集次数
     * @param totalTimeMs 累计收集耗时（毫秒）
     */
    public record GcRecord(
            String name,
            long collections,
            long totalTimeMs
    ) {
    }

    /**
     * 单次 JVM 内存快照。
     * <p>
     * 所有 {@code *Mb} 字段单位为 MB（保留两位小数）。无法获取的字段（如容器外的
     * 非 Linux 环境读不到 RSS / cgroup 限制）会置空，前端按缺失处理。
     *
     * @param javaVersion JVM 版本与厂商描述
     * @param availableProcessors 可用的处理器核数
     * @param pid 当前进程 PID
     * @param uptimeMs 进程已运行时长（毫秒）
     * @param cpuProcessLoad 进程 CPU 负载（0~N，可大于 1 表示多核占用；不可用为 -1）
     * @param rssMb 进程常驻内存 RSS（仅 Linux 可读，其余平台为 null）
     * @param containerMemoryLimitMb 容器内存上限（cgroup v1/v2 可读时返回，否则 null）
     * @param heapUsedMb 堆已用（MB）
     * @param heapCommittedMb 堆已提交（MB）
     * @param heapMaxMb 堆上限（MB，容器环境会反映 cgroup 限制）
     * @param heapUsedPercent 堆已用占上限百分比
     * @param nonHeapUsedMb 非堆已用（MB）
     * @param nonHeapCommittedMb 非堆已提交（MB）
     * @param metaspaceUsedMb Metaspace 已用（MB，无可读则 null）
     * @param metaspaceMaxMb Metaspace 上限（MB，无可读则 null）
     * @param codeCacheUsedMb Code Cache 已用（MB，无可读则 null）
     * @param loadedClasses 已加载类数量
     * @param liveThreads 当前存活线程数
     * @param peakThreads 历史峰值线程数
     * @param totalStartedThreads 累计创建线程总数
     * @param daemonThreads 守护线程数
     * @param threadStackMbEstimate 线程栈估算（≈存活线程数 × 约1MB，来源于 JVM 默认 -Xss）
     * @param gc GC 收集器累计统计列表
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record JvmMemorySnapshot(
            String javaVersion,
            int availableProcessors,
            long pid,
            long uptimeMs,
            double cpuProcessLoad,
            Double rssMb,
            Double containerMemoryLimitMb,
            double heapUsedMb,
            double heapCommittedMb,
            double heapMaxMb,
            double heapUsedPercent,
            double nonHeapUsedMb,
            double nonHeapCommittedMb,
            Double metaspaceUsedMb,
            Double metaspaceMaxMb,
            Double codeCacheUsedMb,
            int loadedClasses,
            int liveThreads,
            int peakThreads,
            long totalStartedThreads,
            int daemonThreads,
            double threadStackMbEstimate,
            List<GcRecord> gc
    ) {
        /** 起一个 Builder，避免 23 参位置构造的误读风险。 */
        public static Builder builder() {
            return new Builder();
        }

        /** {@link JvmMemorySnapshot} 的流式构造器，字段名一一对应。 */
        public static final class Builder {
            private String javaVersion;
            private int availableProcessors;
            private long pid;
            private long uptimeMs;
            private double cpuProcessLoad;
            private Double rssMb;
            private Double containerMemoryLimitMb;
            private double heapUsedMb;
            private double heapCommittedMb;
            private double heapMaxMb;
            private double heapUsedPercent;
            private double nonHeapUsedMb;
            private double nonHeapCommittedMb;
            private Double metaspaceUsedMb;
            private Double metaspaceMaxMb;
            private Double codeCacheUsedMb;
            private int loadedClasses;
            private int liveThreads;
            private int peakThreads;
            private long totalStartedThreads;
            private int daemonThreads;
            private double threadStackMbEstimate;
            private List<GcRecord> gc;

            private Builder() {
            }

            public Builder javaVersion(String v) { this.javaVersion = v; return this; }
            public Builder availableProcessors(int v) { this.availableProcessors = v; return this; }
            public Builder pid(long v) { this.pid = v; return this; }
            public Builder uptimeMs(long v) { this.uptimeMs = v; return this; }
            public Builder cpuProcessLoad(double v) { this.cpuProcessLoad = v; return this; }
            public Builder rssMb(Double v) { this.rssMb = v; return this; }
            public Builder containerMemoryLimitMb(Double v) { this.containerMemoryLimitMb = v; return this; }
            public Builder heapUsedMb(double v) { this.heapUsedMb = v; return this; }
            public Builder heapCommittedMb(double v) { this.heapCommittedMb = v; return this; }
            public Builder heapMaxMb(double v) { this.heapMaxMb = v; return this; }
            public Builder heapUsedPercent(double v) { this.heapUsedPercent = v; return this; }
            public Builder nonHeapUsedMb(double v) { this.nonHeapUsedMb = v; return this; }
            public Builder nonHeapCommittedMb(double v) { this.nonHeapCommittedMb = v; return this; }
            public Builder metaspaceUsedMb(Double v) { this.metaspaceUsedMb = v; return this; }
            public Builder metaspaceMaxMb(Double v) { this.metaspaceMaxMb = v; return this; }
            public Builder codeCacheUsedMb(Double v) { this.codeCacheUsedMb = v; return this; }
            public Builder loadedClasses(int v) { this.loadedClasses = v; return this; }
            public Builder liveThreads(int v) { this.liveThreads = v; return this; }
            public Builder peakThreads(int v) { this.peakThreads = v; return this; }
            public Builder totalStartedThreads(long v) { this.totalStartedThreads = v; return this; }
            public Builder daemonThreads(int v) { this.daemonThreads = v; return this; }
            public Builder threadStackMbEstimate(double v) { this.threadStackMbEstimate = v; return this; }
            public Builder gc(List<GcRecord> v) { this.gc = v; return this; }

            public JvmMemorySnapshot build() {
                return new JvmMemorySnapshot(
                        javaVersion,
                        availableProcessors,
                        pid,
                        uptimeMs,
                        cpuProcessLoad,
                        rssMb,
                        containerMemoryLimitMb,
                        heapUsedMb,
                        heapCommittedMb,
                        heapMaxMb,
                        heapUsedPercent,
                        nonHeapUsedMb,
                        nonHeapCommittedMb,
                        metaspaceUsedMb,
                        metaspaceMaxMb,
                        codeCacheUsedMb,
                        loadedClasses,
                        liveThreads,
                        peakThreads,
                        totalStartedThreads,
                        daemonThreads,
                        threadStackMbEstimate,
                        gc
                );
            }
        }
    }
}