package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SqliteRagLabService 集成单测：真实的临时 SQLite 文件（不依赖网络/部署环境），
 * 覆盖播种、三通道检索、投喂、对战、info 与计时。
 */
class SqliteRagLabServiceTest {

    private SqliteRagLabService service;

    @BeforeEach
    void setUp() {
        service = new SqliteRagLabService();
        service.init();
    }

    @Test
    void init_seeds_builtin_corpus() {
        Map<String, Object> info = service.doInfo();
        @SuppressWarnings("unchecked")
        Map<String, Integer> counts = (Map<String, Integer>) info.get("counts");
        assertTrue(counts.get("docs") >= 25);
        assertTrue(counts.get("chunks") >= 40);
        assertNotNull(info.get("sqliteVersion"));
    }

    @Test
    void hybrid_finds_installed_base_doc_for_semantic_query() {
        Map<String, Object> r = service.doHybridSearch("世界上装机量最大的数据库是什么", 5);
        List<Map<String, Object>> results = top(r);
        assertFalse(results.isEmpty());
        assertTrue(results.stream().anyMatch(h -> ((String) h.get("title")).contains("部署量")),
                "实际返回: " + titles(r));
    }

    @Test
    void hybrid_returns_timings_map_with_three_channels() throws Exception {
        Map<String, Object> res = service.doHybridSearch("嵌入式数据库架构", 5);
        Map<String, Double> timings = timingsOf(res);
        assertTrue(res.containsKey("totalMs"));
        assertEquals(List.of("fts", "vec", "fuse", "total"), timings.keySet().stream().toList());
    }

    @Test
    void fts_channel_hits_exact_keyword() {
        List<SqliteRagLabLogic.Hit> hits = service.ftsSearch("Pinecone", 5);
        assertFalse(hits.isEmpty());
    }

    @Test
    void battle_cards_and_target_consistency() {
        Map<String, Object> battle = service.doBattle("本地 RAG 为什么不用向量数据库服务器");
        List<Map<String, Object>> cards = cardsOf(battle);
        assertTrue(cards.size() >= 4, "cards = " + cards);
        List<Integer> target = targetOf(battle);
        assertEquals(Math.min(SqliteRagLabService.BATTLE_LIMIT, cards.size()), target.size());
        var ids = cards.stream().map(c -> (int) c.get("chunkId")).toList();
        assertTrue(target.stream().allMatch(ids::contains));
    }

    @Test
    void ingest_then_query_immediately_findable() {
        int beforeChunks = ((Number) ((Map<?, ?>) service.doInfo().get("counts")).get("chunks")).intValue();
        int docId = service.ingestInternal("投喂测试",
                "楼下拉面馆周三会休息，老板说不支持扫码支付，去吃记得带现金，写进了这个文件里。",
                "用户投喂");
        assertTrue(docId > 0);
        int afterChunks = ((Number) ((Map<?, ?>) service.doInfo().get("counts")).get("chunks")).intValue();
        assertTrue(afterChunks > beforeChunks);

        Map<String, Object> res = service.doHybridSearch("拉面馆 周三 休息", 5);
        boolean found = top(res).stream()
                .anyMatch(h -> ((String) h.get("content")).contains("拉面馆"));
        assertTrue(found, "投喂后应能检索到: " + titles(res));
    }

    @Test
    void db_file_exists_after_init() throws Exception {
        Field f = SqliteRagLabService.class.getDeclaredField("dbPath");
        f.setAccessible(true);
        Path dbPath = (Path) f.get(service);
        assertTrue(java.nio.file.Files.exists(dbPath));
        assertTrue(java.nio.file.Files.size(dbPath) > 0);
    }

    // ============= 反射辅助 =============

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> top(Map<String, Object> res) {
        return (List<Map<String, Object>>) res.get("results");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> cardsOf(Map<String, Object> res) {
        return (List<Map<String, Object>>) res.get("cards");
    }

    @SuppressWarnings("unchecked")
    private static List<Integer> targetOf(Map<String, Object> res) {
        return (List<Integer>) res.get("target");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Double> timingsOf(Map<String, Object> res) {
        return (Map<String, Double>) res.get("timings");
    }

    private static List<String> titles(Map<String, Object> res) {
        return top(res).stream().map(h -> (String) h.get("title")).toList();
    }
}
