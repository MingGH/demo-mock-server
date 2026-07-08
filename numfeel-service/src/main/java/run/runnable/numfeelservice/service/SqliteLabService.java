package run.runnable.numfeelservice.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * SQLite 并发压力实验室 — 业务逻辑层。
 * <p>
 * 维护一个临时 SQLite 文件，提供：
 * <ul>
 *   <li>单次写入（用户点击触发）</li>
 *   <li>并发压测（模拟 N 个并发写入）</li>
 *   <li>状态查询（文件大小、行数、最近 QPS 统计）</li>
 *   <li>重置（清空数据库）</li>
 * </ul>
 * <p>
 * SQLite 是阻塞式 JDBC，通过 {@code Schedulers.boundedElastic()} 调度到弹性线程池
 * 避免阻塞 Netty event loop。
 */
@Service
public class SqliteLabService {

    private static final Logger log = LoggerFactory.getLogger(SqliteLabService.class);

    /** SQLite 文件路径（临时目录，服务重启丢失） */
    private Path dbPath;
    private String jdbcUrl;

    /** 记录最近写入时间戳，用于计算实时 QPS */
    private final ConcurrentLinkedDeque<Long> recentWrites = new ConcurrentLinkedDeque<>();
    private static final long QPS_WINDOW_MS = 5000;

    /** 累计统计 */
    private final AtomicLong totalWrites = new AtomicLong(0);
    private final AtomicLong totalBusyErrors = new AtomicLong(0);

    @PostConstruct
    void init() {
        try {
            dbPath = Files.createTempFile("sqlite-lab-", ".db");
            jdbcUrl = "jdbc:sqlite:" + dbPath.toAbsolutePath();
            initSchema();
            log.info("SQLite lab database created at: {}", dbPath);
        } catch (Exception e) {
            log.error("Failed to initialize SQLite lab database", e);
            throw new RuntimeException("SQLite lab init failed", e);
        }
    }

    @PreDestroy
    void cleanup() {
        try {
            Files.deleteIfExists(dbPath);
            log.info("SQLite lab database cleaned up");
        } catch (Exception e) {
            log.warn("Failed to cleanup SQLite lab database: {}", e.getMessage());
        }
    }

    private void initSchema() throws SQLException {
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("CREATE TABLE IF NOT EXISTS pressure_log ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    + "payload TEXT NOT NULL, "
                    + "source TEXT NOT NULL, "
                    + "created_at INTEGER NOT NULL"
                    + ")");
        }
    }

    /** 获取一个新的 SQLite 连接（不用连接池，SQLite 本身只有一把写锁）。 */
    Connection getConnection() throws SQLException {
        Connection conn = DriverManager.getConnection(jdbcUrl);
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("PRAGMA busy_timeout = 100");
        }
        return conn;
    }

    // ============= 单次写入 =============

    /**
     * 执行一次写入操作，返回写入耗时（ms）。
     */
    public Mono<WriteResult> singleWrite(String source) {
        return Mono.fromCallable(() -> doWrite(source))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 实际执行写入，返回结果（成功/BUSY + 耗时） */
    WriteResult doWrite(String source) {
        long start = System.nanoTime();
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO pressure_log (payload, source, created_at) VALUES (?, ?, ?)")) {
            ps.setString(1, "write-" + System.currentTimeMillis());
            ps.setString(2, source);
            ps.setLong(3, System.currentTimeMillis());
            ps.executeUpdate();
            long elapsed = (System.nanoTime() - start) / 1_000_000;
            recordWrite();
            return new WriteResult(true, elapsed, null);
        } catch (SQLException e) {
            long elapsed = (System.nanoTime() - start) / 1_000_000;
            if (isBusyError(e)) {
                totalBusyErrors.incrementAndGet();
                return new WriteResult(false, elapsed, "SQLITE_BUSY");
            }
            return new WriteResult(false, elapsed, e.getMessage());
        }
    }

    // ============= 并发压测 =============

    /**
     * 模拟 concurrency 个并发写入，返回聚合统计。
     *
     * @param concurrency 并发数（1-200）
     * @param walMode     是否启用 WAL 模式
     */
    public Mono<BurstResult> burst(int concurrency, boolean walMode) {
        return Mono.fromCallable(() -> doBurst(concurrency, walMode))
                .subscribeOn(Schedulers.boundedElastic());
    }

    BurstResult doBurst(int concurrency, boolean walMode) {
        // 设置 journal 模式
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("PRAGMA journal_mode = " + (walMode ? "WAL" : "DELETE"));
        } catch (SQLException e) {
            log.warn("Failed to set journal mode", e);
        }

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger busyCount = new AtomicInteger(0);
        List<Long> latencies = new ArrayList<>();
        Object latencyLock = new Object();

        ExecutorService pool = Executors.newFixedThreadPool(Math.min(concurrency, 50));
        CountDownLatch latch = new CountDownLatch(concurrency);
        long burstStart = System.nanoTime();

        for (int i = 0; i < concurrency; i++) {
            pool.submit(() -> {
                try {
                    WriteResult r = doWrite("burst");
                    if (r.success()) {
                        successCount.incrementAndGet();
                    } else {
                        busyCount.incrementAndGet();
                    }
                    synchronized (latencyLock) {
                        latencies.add(r.latencyMs());
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        pool.shutdown();

        long totalTime = (System.nanoTime() - burstStart) / 1_000_000;
        List<Long> sorted = latencies.stream().sorted().toList();

        long p50 = percentile(sorted, 50);
        long p95 = percentile(sorted, 95);
        long p99 = percentile(sorted, 99);
        long maxLatency = sorted.isEmpty() ? 0 : sorted.get(sorted.size() - 1);

        return new BurstResult(
                concurrency,
                successCount.get(),
                busyCount.get(),
                totalTime,
                p50,
                p95,
                p99,
                maxLatency,
                walMode
        );
    }

    // ============= 状态查询 =============

    public Mono<StatsResult> stats() {
        return Mono.fromCallable(this::doStats)
                .subscribeOn(Schedulers.boundedElastic());
    }

    StatsResult doStats() {
        long rowCount = 0;
        long fileSizeBytes = 0;

        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM pressure_log")) {
            if (rs.next()) {
                rowCount = rs.getLong(1);
            }
        } catch (SQLException e) {
            log.warn("Failed to query row count", e);
        }

        try {
            fileSizeBytes = Files.size(dbPath);
        } catch (Exception e) {
            log.warn("Failed to read file size", e);
        }

        double qps = calculateQps();

        return new StatsResult(rowCount, fileSizeBytes, qps,
                totalWrites.get(), totalBusyErrors.get());
    }

    // ============= 重置 =============

    public Mono<Void> reset() {
        return Mono.fromRunnable(this::doReset)
                .subscribeOn(Schedulers.boundedElastic())
                .then();
    }

    void doReset() {
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("DELETE FROM pressure_log");
            stmt.execute("VACUUM");
        } catch (SQLException e) {
            log.warn("Failed to reset database", e);
        }
        totalWrites.set(0);
        totalBusyErrors.set(0);
        recentWrites.clear();
    }

    // ============= 内部辅助 =============

    private void recordWrite() {
        long now = System.currentTimeMillis();
        totalWrites.incrementAndGet();
        recentWrites.addLast(now);
        // 清理过期记录
        while (!recentWrites.isEmpty() && recentWrites.peekFirst() < now - QPS_WINDOW_MS) {
            recentWrites.pollFirst();
        }
    }

    double calculateQps() {
        long now = System.currentTimeMillis();
        while (!recentWrites.isEmpty() && recentWrites.peekFirst() < now - QPS_WINDOW_MS) {
            recentWrites.pollFirst();
        }
        int count = recentWrites.size();
        return Math.round(count * 1000.0 / QPS_WINDOW_MS * 10.0) / 10.0;
    }

    static long percentile(List<Long> sorted, int pct) {
        if (sorted.isEmpty()) return 0;
        int idx = (int) Math.ceil(pct / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }

    static boolean isBusyError(SQLException e) {
        // SQLite BUSY error code is 5
        return e.getErrorCode() == 5
                || (e.getMessage() != null && e.getMessage().contains("SQLITE_BUSY"));
    }

    // ============= DTO Records =============

    public record WriteResult(boolean success, long latencyMs, String error) {
    }

    public record BurstResult(
            int concurrency,
            int successCount,
            int busyCount,
            long totalTimeMs,
            long p50Ms,
            long p95Ms,
            long p99Ms,
            long maxMs,
            boolean walMode
    ) {
    }

    public record StatsResult(
            long rowCount,
            long fileSizeBytes,
            double currentQps,
            long totalWrites,
            long totalBusyErrors
    ) {
    }
}
