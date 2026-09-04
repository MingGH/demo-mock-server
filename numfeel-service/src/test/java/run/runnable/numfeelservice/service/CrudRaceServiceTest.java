package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CrudRaceService.RunResult;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * CrudRaceService 单元测试 — text / caffeine 引擎。
 * <p>
 * 覆盖：seed 生成确定性、四种 CRUD 操作语义、脏标记自动重建、基准结果统计。
 * mysql 引擎需要真实数据库，由部署环境验证，此处不覆盖。
 */
class CrudRaceServiceTest {

    private CrudRaceService service;

    @BeforeEach
    void setUp() {
        service = new CrudRaceService(null);
        service.init();
    }

    @AfterEach
    void tearDown() {
        service.cleanup();
    }

    // ============= seed 生成 =============

    @Test
    void keyOf_format() {
        assertEquals("k0000000", CrudRaceService.keyOf(0));
        assertEquals("k0000042", CrudRaceService.keyOf(42));
        assertEquals("k0999999", CrudRaceService.keyOf(999_999));
    }

    @Test
    void valueOf_deterministic() {
        assertEquals(CrudRaceService.valueOf(123), CrudRaceService.valueOf(123));
        assertNotEquals(CrudRaceService.valueOf(123), CrudRaceService.valueOf(124));
    }

    @Test
    void valueOf_format_supports_first_pipe_split() {
        // value 自身含 '|'（订单串），行解析按第一个 '|' 切分：key 在前、value 在后
        for (int i : new int[]{0, 1, 42, 999, 100000}) {
            String key = CrudRaceService.keyOf(i);
            String value = CrudRaceService.valueOf(i);
            String line = key + "|" + value;
            int sep = line.indexOf('|');
            assertEquals(key, line.substring(0, sep));
            assertEquals(value, line.substring(sep + 1));
        }
    }

    // ============= text 引擎 CRUD 语义 =============

    @Test
    void resetText_writes_exact_lines() throws IOException {
        service.resetText(100);
        assertEquals(100, lineCount());
    }

    @Test
    void textGet_finds_existing_key() throws IOException {
        service.resetText(10);
        assertEquals(CrudRaceService.valueOf(3), service.textGet(CrudRaceService.keyOf(3)));
    }

    @Test
    void textGet_missing_key_returns_null() throws IOException {
        service.resetText(10);
        assertNull(service.textGet(CrudRaceService.keyOf(9999)));
    }

    @Test
    void textInsert_appends_line() throws IOException {
        service.resetText(5);
        service.textInsert(CrudRaceService.keyOf(1_000_000), "v");
        assertEquals(6, lineCount());
        assertEquals("v", service.textGet(CrudRaceService.keyOf(1_000_000)));
    }

    @Test
    void textUpdate_replaces_value_keeps_others() throws IOException {
        service.resetText(10);
        boolean updated = service.textUpdate(CrudRaceService.keyOf(4), "new-value");

        assertTrue(updated);
        assertEquals(10, lineCount(), "update must not change line count");
        assertEquals("new-value", service.textGet(CrudRaceService.keyOf(4)));
        assertEquals(CrudRaceService.valueOf(5), service.textGet(CrudRaceService.keyOf(5)));
    }

    @Test
    void textUpdate_missing_key_returns_false() throws IOException {
        service.resetText(10);
        assertFalse(service.textUpdate(CrudRaceService.keyOf(9999), "v"));
    }

    @Test
    void textDelete_removes_line() throws IOException {
        service.resetText(10);
        boolean deleted = service.textDelete(CrudRaceService.keyOf(7));

        assertTrue(deleted);
        assertEquals(9, lineCount());
        assertNull(service.textGet(CrudRaceService.keyOf(7)));
        assertEquals(CrudRaceService.valueOf(8), service.textGet(CrudRaceService.keyOf(8)));
    }

    @Test
    void textDelete_missing_key_returns_false() throws IOException {
        service.resetText(10);
        assertFalse(service.textDelete(CrudRaceService.keyOf(9999)));
    }

    // ============= doRunText：基准与脏标记 =============

    @Test
    void runText_get_all_hit() {
        RunResult r = service.doRunText(100, "get", 50);
        assertEquals("text", r.engine());
        assertEquals("get", r.op());
        assertEquals(100, r.count());
        assertEquals(50, r.ops());
        assertEquals(50, r.okCount(), "random keys all exist in seeded data");
        assertTrue(r.totalMs() >= 0);
        assertTrue(r.avgUs() >= 0);
        assertTrue(r.qps() > 0);
        assertNotNull(r.dataSizeBytes());
        assertTrue(r.dataSizeBytes() > 0, "seeded file must be non-empty");
    }

    @Test
    void runText_reset_excluded_from_benchmark() {
        // 首跑需要 reset；同参数二跑数据已就绪，resetMs 应为 0
        service.doRunText(50, "get", 10);
        RunResult second = service.doRunText(50, "get", 10);
        assertEquals(0, second.resetMs(), "second run with same count should skip reseed");
    }

    @Test
    void runText_insert_marks_dirty_and_reseeds_next_run() throws IOException {
        service.doRunText(50, "insert", 20);
        assertEquals(70, lineCount(), "50 seed + 20 inserted");

        // insert 弄脏数据后，下一轮同 count 自动重建回 50 行
        RunResult next = service.doRunText(50, "get", 10);
        assertEquals(50, lineCount());
        assertTrue(next.resetMs() >= 0);
    }

    @Test
    void runText_delete_marks_dirty() throws IOException {
        RunResult r = service.doRunText(100, "delete", 30);
        assertTrue(lineCount() < 100, "some lines must be deleted");
        assertTrue(r.okCount() <= 30, "random keys may repeat, okCount <= ops");

        service.doRunText(100, "get", 10);
        assertEquals(100, lineCount(), "reseed after delete restores count");
    }

    @Test
    void runText_update_does_not_dirty() throws IOException {
        service.doRunText(100, "update", 10);
        assertEquals(100, lineCount());

        RunResult second = service.doRunText(100, "update", 10);
        assertEquals(0, second.resetMs(), "update does not require reseed");
    }

    @Test
    void runText_count_change_triggers_reseed() throws IOException {
        service.doRunText(100, "get", 5);
        service.doRunText(500, "get", 5);
        assertEquals(500, lineCount());
    }

    // ============= caffeine 引擎 =============

    @Test
    void runCaffeine_get_all_hit() {
        RunResult r = service.doRunCaffeine(100, "get", 50);
        assertEquals("caffeine", r.engine());
        assertEquals(50, r.okCount());
        assertTrue(r.qps() > 0);
        assertNull(r.dataSizeBytes(), "caffeine engine has no file size");
    }

    @Test
    void runCaffeine_memory_engine_should_be_fast() {
        // 纯内存哈希表：200 次 get 应在毫秒级完成，这是「内存引擎快」的基本盘
        RunResult r = service.doRunCaffeine(10_000, "get", 200);
        assertTrue(r.totalMs() < 1000, "caffeine 200 gets should finish quickly, got " + r.totalMs() + "ms");
    }

    @Test
    void runCaffeine_insert_marks_dirty_and_reseeds() {
        RunResult first = service.doRunCaffeine(50, "insert", 20);
        assertEquals(20, first.okCount());

        // insert 弄脏数据后，下一轮同 count 自动重建，key 空间恢复完整
        RunResult second = service.doRunCaffeine(50, "get", 10);
        assertEquals(10, second.okCount(), "reseeded data has all keys");
    }

    @Test
    void runCaffeine_update_hits_seeded_key() {
        RunResult r = service.doRunCaffeine(100, "update", 50);
        assertEquals(50, r.okCount(), "all random keys exist in seeded data");
    }

    // ============= mysql 引擎（就绪状态机 + permit，不连真库） =============

    @Test
    void mysqlPermit_is_mutex_and_releasable() {
        assertTrue(service.tryAcquireMysqlPermit(), "first acquire succeeds");
        assertFalse(service.tryAcquireMysqlPermit(), "second acquire is rejected");
        service.releaseMysqlPermit();
        assertTrue(service.tryAcquireMysqlPermit(), "re-acquire after release succeeds");
        service.releaseMysqlPermit();
    }

    @Test
    void runMysql_releases_permit_on_error() {
        // DatabaseClient 为 null，订阅后 defer 内部抛 NPE → onError → doFinally 仍须释放许可
        assertTrue(service.tryAcquireMysqlPermit());
        service.runMysql(10, "get", 1)
                .onErrorResume(e -> Mono.empty())
                .block(java.time.Duration.ofSeconds(2));
        assertTrue(service.tryAcquireMysqlPermit(), "permit must be released even on error");
        service.releaseMysqlPermit();
    }

    @Test
    void resetDoneMarker_emits_value_after_empty_reset() {
        // 回归测试：曾对 Mono<Void> 调 map，lambda 永不执行导致链路空完成。
        // resetDoneMarker 必须保证 reset 完成后发射一个值并更新就绪状态。
        Long resetMs = service.resetDoneMarker(Mono.<Void>empty(), 500, System.nanoTime()).block();
        assertNotNull(resetMs, "resetDoneMarker must emit elapsed ms even for empty reset");
        assertTrue(resetMs >= 0);
        assertTrue(service.mysqlReadyFor(500), "resetDoneMarker must mark mysql ready for count");
    }

    @Test
    void resetDoneMarker_changes_ready_count() {
        service.resetDoneMarker(Mono.<Void>empty(), 100, System.nanoTime()).block();
        assertTrue(service.mysqlReadyFor(100));
        assertFalse(service.mysqlReadyFor(200), "ready state must track latest count");
    }

    // ============= 统计辅助 =============

    @Test
    void buildResult_math() {
        RunResult r = CrudRaceService.buildResult("text", "get", 100, 200,
                200, 123, 2_000_000_000L, 4096L);
        assertEquals(123, r.resetMs());
        assertEquals(2000, r.totalMs());
        assertEquals(10000.0, r.avgUs(), 0.01, "2s / 200 ops = 10ms = 10000us");
        assertEquals(100.0, r.qps(), 0.1, "200 ops / 2s = 100 qps");
        assertEquals(4096L, r.dataSizeBytes());
    }

    // ============= 辅助 =============

    private int lineCount() throws IOException {
        List<String> lines = Files.readAllLines(service.dataFilePath(), StandardCharsets.UTF_8);
        return (int) lines.stream().filter(l -> !l.isEmpty()).count();
    }
}
