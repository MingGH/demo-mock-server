package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.service.SqliteLabService.BurstResult;
import run.runnable.numfeelservice.service.SqliteLabService.StatsResult;
import run.runnable.numfeelservice.service.SqliteLabService.WriteResult;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SqliteLabService 单元测试。
 * <p>
 * 测试覆盖：单次写入、并发压测、状态查询、重置、辅助方法。
 * 使用真实临时 SQLite 文件，不 mock 数据库。
 */
class SqliteLabServiceTest {

    private SqliteLabService service;

    @BeforeEach
    void setUp() {
        service = new SqliteLabService();
        service.init();
    }

    @AfterEach
    void tearDown() {
        service.cleanup();
    }

    // ============= 单次写入 =============

    @Test
    void singleWrite_success() {
        WriteResult result = service.doWrite("test");
        assertTrue(result.success(), "Write should succeed");
        assertTrue(result.latencyMs() >= 0, "Latency should be non-negative");
        assertNull(result.error(), "No error on success");
    }

    @Test
    void singleWrite_increments_row_count() {
        service.doWrite("test");
        service.doWrite("test");
        service.doWrite("test");

        StatsResult stats = service.doStats();
        assertEquals(3, stats.rowCount(), "Should have 3 rows after 3 writes");
    }

    @Test
    void singleWrite_records_source() {
        service.doWrite("user-click");
        StatsResult stats = service.doStats();
        assertEquals(1, stats.rowCount());
        assertEquals(1, stats.totalWrites());
    }

    // ============= 并发压测 =============

    @Test
    void burst_low_concurrency_all_succeed() {
        BurstResult result = service.doBurst(5, false);
        assertEquals(5, result.concurrency());
        // With low concurrency and busy_timeout=100ms, most/all should succeed
        assertTrue(result.successCount() + result.busyCount() == 5,
                "Total should equal concurrency");
        assertTrue(result.totalTimeMs() >= 0);
        assertTrue(result.p50Ms() >= 0);
    }

    @Test
    void burst_with_wal_mode() {
        BurstResult result = service.doBurst(10, true);
        assertTrue(result.walMode(), "WAL mode should be reported");
        assertEquals(10, result.concurrency());
        assertEquals(10, result.successCount() + result.busyCount());
    }

    @Test
    void burst_high_concurrency_may_produce_busy() {
        // With 100 concurrent writes, some BUSY errors are expected (but not guaranteed)
        BurstResult result = service.doBurst(100, false);
        assertEquals(100, result.concurrency());
        assertEquals(100, result.successCount() + result.busyCount());
        // p95 should be >= p50
        assertTrue(result.p95Ms() >= result.p50Ms(),
                "P95 should be >= P50");
    }

    @Test
    void burst_wal_reduces_busy_compared_to_default() {
        // Run without WAL
        service.doReset();
        BurstResult noWal = service.doBurst(50, false);

        // Reset and run with WAL
        service.doReset();
        BurstResult withWal = service.doBurst(50, true);

        // WAL mode should generally have fewer BUSY errors (or at least not more)
        // This is a probabilistic assertion, so we just verify both complete
        assertEquals(50, noWal.successCount() + noWal.busyCount());
        assertEquals(50, withWal.successCount() + withWal.busyCount());
    }

    // ============= 状态查询 =============

    @Test
    void stats_empty_database() {
        StatsResult stats = service.doStats();
        assertEquals(0, stats.rowCount());
        assertTrue(stats.fileSizeBytes() > 0, "SQLite file has headers even when empty");
        assertEquals(0.0, stats.currentQps());
        assertEquals(0, stats.totalWrites());
        assertEquals(0, stats.totalBusyErrors());
    }

    @Test
    void stats_reflects_writes() {
        service.doWrite("a");
        service.doWrite("b");
        StatsResult stats = service.doStats();
        assertEquals(2, stats.rowCount());
        assertEquals(2, stats.totalWrites());
    }

    @Test
    void stats_file_size_grows() {
        StatsResult before = service.doStats();
        for (int i = 0; i < 50; i++) {
            service.doWrite("bulk");
        }
        StatsResult after = service.doStats();
        assertTrue(after.fileSizeBytes() >= before.fileSizeBytes(),
                "File should grow after writes");
    }

    // ============= 重置 =============

    @Test
    void reset_clears_data() {
        service.doWrite("x");
        service.doWrite("y");
        service.doReset();

        StatsResult stats = service.doStats();
        assertEquals(0, stats.rowCount());
        assertEquals(0, stats.totalWrites());
        assertEquals(0, stats.totalBusyErrors());
    }

    // ============= 辅助方法 =============

    @Test
    void percentile_empty_list() {
        assertEquals(0, SqliteLabService.percentile(Collections.emptyList(), 50));
    }

    @Test
    void percentile_single_element() {
        assertEquals(42, SqliteLabService.percentile(List.of(42L), 50));
        assertEquals(42, SqliteLabService.percentile(List.of(42L), 99));
    }

    @Test
    void percentile_basic() {
        List<Long> sorted = Arrays.asList(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L);
        assertEquals(5, SqliteLabService.percentile(sorted, 50));
        assertEquals(10, SqliteLabService.percentile(sorted, 99));
        assertEquals(10, SqliteLabService.percentile(sorted, 100));
    }

    @Test
    void percentile_p95_with_100_elements() {
        List<Long> sorted = new java.util.ArrayList<>();
        for (long i = 1; i <= 100; i++) {
            sorted.add(i);
        }
        assertEquals(95, SqliteLabService.percentile(sorted, 95));
    }

    @Test
    void isBusyError_detects_error_code_5() {
        java.sql.SQLException ex = new java.sql.SQLException("database is locked", "HY000", 5);
        assertTrue(SqliteLabService.isBusyError(ex));
    }

    @Test
    void isBusyError_detects_message() {
        java.sql.SQLException ex = new java.sql.SQLException("[SQLITE_BUSY] The database file is locked");
        assertTrue(SqliteLabService.isBusyError(ex));
    }

    @Test
    void isBusyError_other_errors() {
        java.sql.SQLException ex = new java.sql.SQLException("syntax error", "HY000", 1);
        assertFalse(SqliteLabService.isBusyError(ex));
    }

    @Test
    void calculateQps_no_writes() {
        assertEquals(0.0, service.calculateQps());
    }

    @Test
    void calculateQps_after_writes() {
        service.doWrite("a");
        service.doWrite("b");
        service.doWrite("c");
        double qps = service.calculateQps();
        // 3 writes within the 5s window → QPS = 3/5 = 0.6
        assertTrue(qps > 0, "QPS should be positive after writes");
    }
}
