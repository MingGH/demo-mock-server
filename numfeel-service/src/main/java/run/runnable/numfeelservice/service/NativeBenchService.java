package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.web.ApiException;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 跨界收费站 — 真实 C++ vs Java 基准的业务层。
 * <p>
 * native/libnativebench.cpp 编译出的共享库提供三个导出函数：
 * <ul>
 *   <li>{@code nb_get_at}：单元素读。Java 侧每个元素都要发起一次跨语言调用，
 *       每次都交一遍"过路费"（FFM 边界：栈帧切换、参数封送、句柄处理）</li>
 *   <li>{@code nb_sum_range}：攒批过境。一次调用把整段循环交给 C++ 内部干完</li>
 *   <li>{@code nb_noop}：纯过路费。函数体为空，专门测量边界本身的均摊开销</li>
 * </ul>
 * 与 Java JIT 编译后的裸循环对照，就是「Java 集合为什么不用 C++ 写」的现场实验。
 * <p>
 * 测量纪律：每条车道预热触发 JIT、正式测 {@value #REPS} 轮取中位数
 * （中位数能抗住偶发 GC 停顿），累加结果写入 volatile 黑洞防死代码消除。
 * 同一时刻只放行一个基准（Semaphore，与 CrudRaceService 的 mysql 闸门同理）。
 */
@Service
public class NativeBenchService {

    private static final Logger log = LoggerFactory.getLogger(NativeBenchService.class);

    /** 单轮基准的元素规模上限（防恶意大参数把后端打挂） */
    public static final int MAX_COUNT = 5_000_000;
    /** 每条车道正式测量的轮数（奇数，中位数取正中） */
    public static final int REPS = 5;
    /** 每条车道的预热目标操作数（触发 JIT C2 编译） */
    private static final int WARM_OPS = 200_000;

    /** 合法车道名 */
    public static final Set<String> LANES = Set.of("java", "native-percall", "native-batch", "noop");

    private final Semaphore permit = new Semaphore(1);
    private final AtomicBoolean warmedUp = new AtomicBoolean(false);

    @Value("${native.bench.lib:}")
    private String configuredLibPath;

    // ===== native 状态（懒加载，首次运行时初始化） =====
    private volatile boolean nativeAvailable;
    private volatile String nativeError = "";
    private volatile String loadedPath = "";
    /** 库的生命周期 arena：libraryLookup 的地址段挂在这里，服务活着就不能关 */
    private Arena libArena;
    /** 数据的生命周期 arena：换数据规模时整块换掉 */
    private Arena dataArena;
    private MemorySegment fnGetAt;
    private MemorySegment fnSumRange;
    private MethodHandle mhGetAt;
    private MethodHandle mhSumRange;
    private MethodHandle mhNoop;

    /** 数据段缓存：同一规模的 int[] 不重复分配 */
    private MemorySegment dataSegment;
    private int[] javaData;
    private int dataCount = -1;

    /** 测量结果黑洞：防止 JIT 把没有副作用的循环整个删掉 */
    @SuppressWarnings("unused")
    private volatile long blackhole;

    // ============= 库加载 =============

    private synchronized void ensureLoaded() {
        if (nativeAvailable) {
            return;
        }
        if (!nativeError.isEmpty()) {
            // 上次失败过，直接快速失败，不反复尝试
            throw new ApiException(503, "native library unavailable: " + nativeError);
        }
        try {
            Path path = resolveLibraryPath();
            libArena = Arena.ofShared();
            SymbolLookup lib = SymbolLookup.libraryLookup(path, libArena);

            Linker linker = Linker.nativeLinker();
            MethodHandle rawGet = linker.downcallHandle(
                    FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_INT));
            MethodHandle rawSum = linker.downcallHandle(
                    FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS, ValueLayout.JAVA_INT, ValueLayout.JAVA_INT));
            MethodHandle rawNoop = linker.downcallHandle(FunctionDescriptor.ofVoid());

            fnGetAt = lib.find("nb_get_at").orElseThrow(() -> new IllegalStateException("nb_get_at not exported"));
            fnSumRange = lib.find("nb_sum_range").orElseThrow(() -> new IllegalStateException("nb_sum_range not exported"));
            MemorySegment fnNoop = lib.find("nb_noop").orElseThrow(() -> new IllegalStateException("nb_noop not exported"));

            // 函数地址绑定进 handle；数据指针作为参数每次传入（与 JNI 每次传数组一致，本身就是过境成本的一部分）
            mhGetAt = MethodHandles.insertArguments(rawGet, 0, fnGetAt);
            mhSumRange = MethodHandles.insertArguments(rawSum, 0, fnSumRange);
            mhNoop = MethodHandles.insertArguments(rawNoop, 0, fnNoop);

            loadedPath = path.toString();
            nativeAvailable = true;
            log.info("native bench library loaded: {}", loadedPath);
        } catch (Exception e) {
            nativeError = e.getClass().getSimpleName() + ": " + e.getMessage();
            log.warn("native bench library load failed: {}", nativeError);
            releaseArena();
            throw new ApiException(503, "native library unavailable: " + nativeError);
        }
    }

    /**
     * 库文件解析顺序：配置项 → 环境变量 → 运行目录 native/ → 运行目录。
     * 本地 macOS 开发编译 .dylib，容器里是多阶段构建出的 .so，同一套代码两边都能跑。
     */
    private Path resolveLibraryPath() {
        String dylib = "libnativebench.dylib";
        String so = "libnativebench.so";
        String osName = System.getProperty("os.name", "").toLowerCase();
        String libName = osName.contains("mac") || osName.contains("darwin") ? dylib : so;

        List<Path> candidates = new java.util.ArrayList<>();
        if (configuredLibPath != null && !configuredLibPath.isBlank()) {
            candidates.add(Path.of(configuredLibPath));
        }
        String env = System.getenv("NATIVE_BENCH_LIB");
        if (env != null && !env.isBlank()) {
            candidates.add(Path.of(env));
        }
        candidates.add(Path.of("native", libName));
        candidates.add(Path.of("native", "libnativebench.so"));
        candidates.add(Path.of(libName));
        candidates.add(Path.of("libnativebench.so"));

        for (Path p : candidates) {
            if (Files.isRegularFile(p)) {
                return p.toAbsolutePath();
            }
        }
        throw new IllegalStateException("library not found, tried " + candidates);
    }

    private synchronized void releaseArena() {
        if (dataArena != null) {
            dataArena.close();
            dataArena = null;
        }
        if (libArena != null) {
            // 只在卸载失败回滚时走这里；正常生命周期里库 arena 与服务共存亡
            libArena.close();
            libArena = null;
        }
        dataSegment = null;
        javaData = null;
        dataCount = -1;
    }

    // ============= 数据与预热 =============

    private synchronized void ensureData(int count) {
        if (dataCount == count && javaData != null) {
            return;
        }
        if (dataArena != null) {
            // 旧规模的数据整块释放。注意别碰 libArena——函数地址段挂在那上面
            dataArena.close();
        }
        dataArena = Arena.ofShared();
        javaData = new int[count];
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = 0; i < count; i++) {
            javaData[i] = random.nextInt(0, 1000);
        }
        dataSegment = dataArena.allocateFrom(ValueLayout.JAVA_INT, javaData);
        dataCount = count;
    }

    /**
     * JIT 预热：只在 JVM 生命周期内做一次。没预热就测，
     * 解释执行的字节码会把 Java 车道拖慢两个数量级，数字全废。
     */
    private void warmUpOnce() {
        if (!warmedUp.compareAndSet(false, true)) {
            return;
        }
        int warm = Math.min(WARM_OPS, dataCount);
        long acc = 0;
        for (int round = 0; round < 8; round++) {
            for (int i = 0; i < warm; i++) {
                acc += javaData[i];
            }
            try {
                for (int i = 0; i < warm; i++) {
                    acc += (int) mhGetAt.invoke(dataSegment, i);
                }
                long batch = (long) mhSumRange.invoke(dataSegment, 0, warm);
                acc += batch;
            } catch (Throwable e) {
                throw new IllegalStateException("native warmup failed", e);
            }
        }
        blackhole = acc;
        log.info("native bench warmup done ({} ops/round)", warm);
    }

    // ============= 车道实现 =============

    private long laneJava(int count) {
        int[] arr = javaData;
        long acc = 0;
        long start = System.nanoTime();
        for (int i = 0; i < count; i++) {
            acc += arr[i];
        }
        long elapsed = System.nanoTime() - start;
        blackhole = acc;
        return elapsed;
    }

    private long laneNativePerCall(int count) {
        long acc = 0;
        long start = System.nanoTime();
        try {
            for (int i = 0; i < count; i++) {
                acc += (int) mhGetAt.invoke(dataSegment, i);
            }
        } catch (Throwable e) {
            throw new IllegalStateException("native percall failed", e);
        }
        long elapsed = System.nanoTime() - start;
        blackhole = acc;
        return elapsed;
    }

    private long laneNativeBatch(int count) {
        long sum;
        long start = System.nanoTime();
        try {
            sum = (long) mhSumRange.invoke(dataSegment, 0, count);
        } catch (Throwable e) {
            throw new IllegalStateException("native batch failed", e);
        }
        long elapsed = System.nanoTime() - start;
        blackhole = sum;
        return elapsed;
    }

    private long laneNoop(int count) {
        long start = System.nanoTime();
        try {
            for (int i = 0; i < count; i++) {
                mhNoop.invoke();
            }
        } catch (Throwable e) {
            throw new IllegalStateException("native noop failed", e);
        }
        return System.nanoTime() - start;
    }

    // ============= 对外入口 =============

    /**
     * 跑一条车道。返回 Map 结构（沿用 CrudRace 的风格，直接序列化成 JSON data）。
     */
    public Mono<Map<String, Object>> run(String lane, int count) {
        if (!LANES.contains(lane)) {
            throw ApiException.badRequest("lane must be one of " + LANES);
        }
        if (count < 1 || count > MAX_COUNT) {
            throw ApiException.badRequest("count must be between 1 and " + MAX_COUNT);
        }
        return Mono.fromCallable(() -> doRun(lane, count))
                .subscribeOn(Schedulers.boundedElastic());
    }

    private Map<String, Object> doRun(String lane, int count) {
        ensureLoaded();
        ensureData(count);
        warmUpOnce();

        // 预跑一轮当热身，正式测 REPS 轮取中位数
        runLaneOnce(lane, count);

        long[] samples = new long[REPS];
        for (int r = 0; r < REPS; r++) {
            samples[r] = runLaneOnce(lane, count);
        }
        long median = NativeBenchStats.median(samples);

        Map<String, Object> result = new HashMap<>();
        result.put("lane", lane);
        result.put("count", count);
        result.put("reps", REPS);
        result.put("medianNs", median);
        result.put("minNs", samples[0]);
        result.put("maxNs", samples[REPS - 1]);
        result.put("perOpNs", (double) median / count);
        return result;
    }

    private long runLaneOnce(String lane, int count) {
        return switch (lane) {
            case "java" -> laneJava(count);
            case "native-percall" -> laneNativePerCall(count);
            case "native-batch" -> laneNativeBatch(count);
            case "noop" -> laneNoop(count);
            default -> throw new IllegalStateException("unknown lane " + lane);
        };
    }

    /** 后端状态：库是否可用、跑在什么环境上（前端状态灯和结果标注用） */
    public synchronized Map<String, Object> status() {
        Map<String, Object> info = new HashMap<>();
        info.put("osName", System.getProperty("os.name"));
        info.put("osArch", System.getProperty("os.arch"));
        info.put("javaVersion", System.getProperty("java.version"));
        info.put("maxCount", MAX_COUNT);
        if (nativeAvailable) {
            info.put("available", true);
            info.put("library", loadedPath);
            return info;
        }
        if (nativeError.isEmpty()) {
            // 还没试过加载：试一次再回报，前端拿到的是确定结论
            try {
                ensureLoaded();
                info.put("available", true);
                info.put("library", loadedPath);
            } catch (Exception e) {
                info.put("available", false);
                info.put("error", nativeError);
            }
            return info;
        }
        info.put("available", false);
        info.put("error", nativeError);
        return info;
    }

    /** 尝试获取基准执行许可（必须在订阅前同步调用，防多用户互相污染数字） */
    public boolean tryAcquirePermit() {
        return permit.tryAcquire();
    }

    /** 释放许可（controller 在 doFinally 里挂载） */
    public void releasePermit() {
        permit.release();
    }
}
