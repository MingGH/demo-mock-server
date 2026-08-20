package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.MemoryResponses.GcRecord;
import run.runnable.numfeelservice.controller.dto.MemoryResponses.JvmMemorySnapshot;
import com.sun.management.OperatingSystemMXBean;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryUsage;
import java.lang.management.RuntimeMXBean;
import java.lang.management.ThreadMXBean;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 读取「当前运行中的服务」自身的 JVM 内存快照。
 * <p>
 * 由于涉及读取 {@code /proc} 与 cgroup 文件（阻塞 I/O），整体构建放到
 * boundedElastic 调度器上执行，避免阻塞事件循环线程。
 */
@Service
public class JvmMemoryService {

    private static final double MB = 1024.0 * 1024.0;

    /**
     * 采集一次 JVM 内存快照。
     *
     * @return 当前 JVM 的内存与运行时信息的响应式流
     */
    public Mono<JvmMemorySnapshot> snapshot() {
        return Mono.fromCallable(this::collect)
                .subscribeOn(Schedulers.boundedElastic());
    }

    private JvmMemorySnapshot collect() {
        var rt = ManagementFactory.getRuntimeMXBean();
        var mem = ManagementFactory.getMemoryMXBean();
        var thread = ManagementFactory.getThreadMXBean();
        var classes = ManagementFactory.getClassLoadingMXBean();
        var os = ManagementFactory.getOperatingSystemMXBean();

        MemoryUsage heap = mem.getHeapMemoryUsage();
        MemoryUsage nonHeap = mem.getNonHeapMemoryUsage();

        Long metaspaceUsed = poolUsage(poolName("Metaspace"));
        Long metaspaceMax = poolMax(poolName("Metaspace"));
        Long codeCacheUsed = sumPoolUsage(predicate -> predicate.contains("Code"));

        List<GcRecord> gcRecords = new ArrayList<>();
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            gcRecords.add(new GcRecord(gc.getName(), gc.getCollectionCount(), gc.getCollectionTime()));
        }

        double cpuLoad = (os instanceof OperatingSystemMXBean com)
                ? com.getProcessCpuLoad()
                : -1.0;

        long heapUsedPct = heap.getMax() > 0
                ? Math.round(heap.getUsed() * 100.0 / heap.getMax())
                : 0;

        long pid = ProcessHandle.current().pid();

        return JvmMemorySnapshot.builder()
                .javaVersion(System.getProperty("java.version") + " · " + rt.getVmName())
                .availableProcessors(os.getAvailableProcessors())
                .pid(pid)
                .uptimeMs(rt.getUptime())
                .cpuProcessLoad(round2(cpuLoad))
                .rssMb(readRssMb())
                .containerMemoryLimitMb(readContainerMemoryLimitMb())
                .heapUsedMb(round2(mb(heap.getUsed())))
                .heapCommittedMb(round2(mb(heap.getCommitted())))
                .heapMaxMb(round2(mb(heap.getMax())))
                .heapUsedPercent(heapUsedPct)
                .nonHeapUsedMb(round2(mb(nonHeap.getUsed())))
                .nonHeapCommittedMb(round2(mb(nonHeap.getCommitted())))
                .metaspaceUsedMb(metaspaceUsed == null ? null : round2(mb(metaspaceUsed)))
                .metaspaceMaxMb(metaspaceMax == null ? null : round2(mb(metaspaceMax)))
                .codeCacheUsedMb(codeCacheUsed == null ? null : round2(mb(codeCacheUsed)))
                .loadedClasses(classes.getLoadedClassCount())
                .liveThreads(thread.getThreadCount())
                .peakThreads(thread.getPeakThreadCount())
                .totalStartedThreads(thread.getTotalStartedThreadCount())
                .daemonThreads(thread.getDaemonThreadCount())
                .threadStackMbEstimate(thread.getThreadCount())
                .gc(gcRecords)
                .build();
    }

    /** 读取进程常驻内存 RSS（Linux 的 /proc/self/status），其他平台返回 null。 */
    private Double readRssMb() {
        try {
            List<String> lines = Files.readAllLines(Path.of("/proc/self/status"));
            for (String line : lines) {
                if (line.startsWith("VmRSS:")) {
                    String[] parts = line.trim().split("\\s+");
                    long kb = Long.parseLong(parts[1]);
                    return round2(kb / 1024.0);
                }
            }
            return null;
        } catch (IOException | NumberFormatException e) {
            return null;
        }
    }

    /** 读取 cgroup 内存上限（优先 v2 的 memory.max，退回 v1 的 memory.limit_in_bytes）。 */
    private Double readContainerMemoryLimitMb() {
        Path v2 = Path.of("/sys/fs/cgroup/memory.max");
        try {
            String raw = Files.readString(v2).trim();
            if (!raw.isEmpty() && !"-".equals(raw)) {
                long bytes = Long.parseLong(raw);
                return bytes > 0 ? round2(bytes / MB) : null;
            }
            return null;
        } catch (IOException | NumberFormatException e) {
            // 退回 cgroup v1
        }
        Path v1 = Path.of("/sys/fs/cgroup/memory/memory.limit_in_bytes");
        try {
            long bytes = Long.parseLong(Files.readString(v1).trim());
            // cgroup v1 的极大值表示「无限制」
            if (bytes > 0 && bytes < Long.MAX_VALUE / 2) {
                return round2(bytes / MB);
            }
            return null;
        } catch (IOException | NumberFormatException e) {
            return null;
        }
    }

    /** 按精确名称取内存池的使用量。 */
    private Long poolUsage(String name) {
        if (name == null) {
            return null;
        }
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (name.equals(pool.getName()) && pool.getUsage() != null) {
                return pool.getUsage().getUsed();
            }
        }
        return null;
    }

    /** 按精确名称取内存池的上限。 */
    private Long poolMax(String name) {
        if (name == null) {
            return null;
        }
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (name.equals(pool.getName()) && pool.getUsage() != null) {
                return pool.getUsage().getMax();
            }
        }
        return null;
    }

    /** 找到 Metaspace 内存池的名称（HotSpot 为 "Metaspace"）。 */
    private String poolName(String want) {
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (want.equals(pool.getName())) {
                return pool.getName();
            }
        }
        return null;
    }

    /** 对名称满足谓词的内存池做「已用内存」求和。 */
    private Long sumPoolUsage(java.util.function.Predicate<String> predicate) {
        long total = 0;
        boolean found = false;
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (predicate.test(pool.getName()) && pool.getUsage() != null) {
                total += pool.getUsage().getUsed();
                found = true;
            }
        }
        return found ? total : null;
    }

    private static double mb(long bytes) {
        return bytes / MB;
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}