package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.service.GrepVsSqliteService.*;

import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

/**
 * GrepVsSqliteService 单元测试。
 * <p>
 * 使用小数据集（1000条）在真实临时文件/SQLite上运行，
 * 验证核心搜索、插入、复杂查询、删除的正确性。
 */
class GrepVsSqliteServiceTest {

    private GrepVsSqliteService service;

    @BeforeEach
    void setUp() {
        service = new GrepVsSqliteService();
        // Override default count via reflection-free approach: call init then reinit with smaller set
        service.init();
        service.doReinit(1000);
    }

    @AfterEach
    void tearDown() {
        service.cleanup();
    }

    // ============= 状态 =============

    @Test
    void status_returns_ready() {
        StatusResult status = service.doStatus();
        assertTrue(status.ready());
        assertEquals(1000, status.messageCount());
        assertTrue(status.fileSizeBytes() > 0, "File should have content");
        assertTrue(status.dbSizeBytes() > 0, "DB should have content");
    }

    // ============= 搜索 =============

    @Test
    void search_finds_matching_messages() {
        // "火锅" appears in message templates
        SearchResult result = service.doSearch("火锅");
        assertTrue(result.grepMatchCount() > 0, "Grep should find matches for '火锅'");
        assertTrue(result.sqliteMatchCount() > 0, "SQLite should find matches for '火锅'");
        assertFalse(result.grepSample().isEmpty(), "Grep should return samples");
        assertFalse(result.sqliteSample().isEmpty(), "SQLite should return samples");
    }

    @Test
    void search_returns_timing() {
        SearchResult result = service.doSearch("天气");
        assertTrue(result.grepTimeMs() >= 0, "Grep time should be non-negative");
        assertTrue(result.sqliteTimeMs() >= 0, "SQLite time should be non-negative");
    }

    @Test
    void search_no_results_for_gibberish() {
        SearchResult result = service.doSearch("zxcvbnm123456");
        assertEquals(0, result.grepMatchCount());
        assertEquals(0, result.sqliteMatchCount());
        assertTrue(result.grepSample().isEmpty());
        assertTrue(result.sqliteSample().isEmpty());
    }

    @Test
    void search_blank_keyword() {
        SearchResult result = service.doSearch("");
        assertEquals(0, result.grepMatchCount());
        assertEquals(0, result.sqliteMatchCount());
    }

    @Test
    void search_counts_match_between_grep_and_sqlite() {
        SearchResult result = service.doSearch("吃饭");
        // Both approaches should find similar counts (exact match due to same data)
        assertEquals(result.grepMatchCount(), result.sqliteMatchCount(),
                "Grep and SQLite should find same number of matches");
    }

    // ============= 插入 =============

    @Test
    void insert_increases_count() {
        int before = service.doStatus().messageCount();
        InsertResult result = service.doInsert("测试消息内容", "测试用户");
        assertEquals(before + 1, result.totalMessages());
    }

    @Test
    void insert_returns_timing() {
        InsertResult result = service.doInsert("新消息", "用户A");
        assertTrue(result.fileAppendTimeMs() >= 0);
        assertTrue(result.sqliteInsertTimeMs() >= 0);
    }

    @Test
    void insert_message_is_searchable() {
        service.doInsert("独一无二的测试消息XYZ", "测试者");
        SearchResult result = service.doSearch("独一无二的测试消息XYZ");
        assertTrue(result.grepMatchCount() >= 1, "Grep should find inserted message");
        assertTrue(result.sqliteMatchCount() >= 1, "SQLite should find inserted message");
    }

    // ============= 复杂查询 =============

    @Test
    void complexQuery_returns_results() {
        ComplexQueryResult result = service.doComplexQuery("image", 365);
        assertTrue(result.grepMatchCount() > 0, "Should find image messages in last 365 days");
        assertTrue(result.sqliteMatchCount() > 0, "Should find image messages in last 365 days");
        assertEquals("image", result.filterType());
        assertEquals(365, result.filterDays());
    }

    @Test
    void complexQuery_counts_match() {
        ComplexQueryResult result = service.doComplexQuery("text", 180);
        assertEquals(result.grepMatchCount(), result.sqliteMatchCount(),
                "Both approaches should find the same count");
    }

    @Test
    void complexQuery_narrow_window_fewer_results() {
        ComplexQueryResult wide = service.doComplexQuery("text", 365);
        ComplexQueryResult narrow = service.doComplexQuery("text", 30);
        assertTrue(wide.grepMatchCount() >= narrow.grepMatchCount(),
                "Wider window should have >= results than narrow");
    }

    @Test
    void complexQuery_nonexistent_type() {
        ComplexQueryResult result = service.doComplexQuery("nonexistent", 365);
        assertEquals(0, result.grepMatchCount());
        assertEquals(0, result.sqliteMatchCount());
    }

    // ============= 删除 =============

    @Test
    void delete_removes_matching_messages() {
        // Insert a unique message first
        service.doInsert("需要删除的特殊消息ABC", "管理员");
        int before = service.doStatus().messageCount();

        DeleteResult result = service.doDelete("特殊消息ABC");
        assertTrue(result.fileDeletedCount() >= 1, "Should delete from file");
        assertTrue(result.sqliteDeletedCount() >= 1, "Should delete from SQLite");

        // Verify it's gone
        SearchResult search = service.doSearch("特殊消息ABC");
        assertEquals(0, search.grepMatchCount());
    }

    @Test
    void delete_returns_timing() {
        DeleteResult result = service.doDelete("火锅");
        assertTrue(result.fileRewriteTimeMs() >= 0);
        assertTrue(result.sqliteDeleteTimeMs() >= 0);
    }

    @Test
    void delete_blank_keyword() {
        DeleteResult result = service.doDelete("");
        assertEquals(0, result.fileDeletedCount());
        assertEquals(0, result.sqliteDeletedCount());
    }

    // ============= 重初始化 =============

    @Test
    void reinit_changes_message_count() {
        StatusResult result = service.doReinit(2000);
        assertEquals(2000, result.messageCount());
        assertTrue(result.ready());
    }

    @Test
    void reinit_clamps_minimum() {
        StatusResult result = service.doReinit(500); // below minimum 1000
        assertEquals(1000, result.messageCount());
    }

    @Test
    void reinit_clamps_maximum() {
        StatusResult result = service.doReinit(2_000_000); // above maximum 1M
        assertEquals(1_000_000, result.messageCount());
    }

    // ============= 辅助方法 =============

    @Test
    void buildJsonLine_format() {
        String line = GrepVsSqliteService.buildJsonLine("张三", "你好", "text", 1234567890L);
        assertTrue(line.contains("\"s\":\"张三\""));
        assertTrue(line.contains("\"c\":\"你好\""));
        assertTrue(line.contains("\"t\":\"text\""));
        assertTrue(line.contains("\"ts\":1234567890"));
    }

    @Test
    void buildJsonLine_escapes_quotes() {
        String line = GrepVsSqliteService.buildJsonLine("A", "he said \"hello\"", "text", 0);
        assertTrue(line.contains("\\\"hello\\\""), "Should escape quotes");
    }

    @Test
    void extractContent_correct() {
        String line = "{\"s\":\"张三\",\"c\":\"你好世界\",\"t\":\"text\",\"ts\":123}";
        assertEquals("你好世界", GrepVsSqliteService.extractContent(line));
    }

    @Test
    void lineMatchesComplex_positive() {
        String line = "{\"s\":\"张三\",\"c\":\"图片消息\",\"t\":\"image\",\"ts\":9999999999999}";
        assertTrue(GrepVsSqliteService.lineMatchesComplex(line, "image", 1000));
    }

    @Test
    void lineMatchesComplex_wrong_type() {
        String line = "{\"s\":\"张三\",\"c\":\"文本消息\",\"t\":\"text\",\"ts\":9999999999999}";
        assertFalse(GrepVsSqliteService.lineMatchesComplex(line, "image", 1000));
    }

    @Test
    void lineMatchesComplex_too_old() {
        String line = "{\"s\":\"张三\",\"c\":\"旧消息\",\"t\":\"text\",\"ts\":100}";
        assertFalse(GrepVsSqliteService.lineMatchesComplex(line, "text", 9999999999999L));
    }

    @Test
    void nsToMs_precision() {
        assertEquals(1.0, GrepVsSqliteService.nsToMs(1_000_000));
        assertEquals(0.5, GrepVsSqliteService.nsToMs(500_000));
        assertEquals(0.0, GrepVsSqliteService.nsToMs(0));
    }

    @Test
    void escapeJson_handles_special_chars() {
        assertEquals("hello\\\"world", GrepVsSqliteService.escapeJson("hello\"world"));
        assertEquals("line1\\nline2", GrepVsSqliteService.escapeJson("line1\nline2"));
        assertEquals("back\\\\slash", GrepVsSqliteService.escapeJson("back\\slash"));
    }

    @Test
    void generateMessage_produces_non_empty() {
        Random rng = new Random(123);
        String msg = service.generateMessage(rng);
        assertNotNull(msg);
        assertFalse(msg.isBlank());
    }
}
