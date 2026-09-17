package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SqliteRagLabLogic 纯函数单元测试：分词 / 嵌入 / 切块 / FTS 表达式 / RRF 融合。
 */
class SqliteRagLabLogicTest {

    // ============= charTokens =============

    @Test
    void charTokens_cjk_split_per_char() {
        assertEquals(List.of("向", "量", "检", "索"), SqliteRagLabLogic.charTokens("向量检索"));
    }

    @Test
    void charTokens_latin_words_kept_whole_and_lowercased() {
        assertEquals(List.of("sqlite3", "事", "务"), SqliteRagLabLogic.charTokens("SQLite3 事务"));
    }

    @Test
    void charTokens_punctuation_and_whitespace_removed() {
        assertEquals(List.of("混", "合", "答", "案"), SqliteRagLabLogic.charTokens("混合，答案！  "));
    }

    @Test
    void charTokens_null_and_blank() {
        assertTrue(SqliteRagLabLogic.charTokens(null).isEmpty());
        assertTrue(SqliteRagLabLogic.charTokens("   ").isEmpty());
    }

    // ============= embed =============

    @Test
    void embed_fixed_dim_and_normalized() {
        float[] vec = SqliteRagLabLogic.embed("单文件数据库零配置开箱即用");
        assertEquals(SqliteRagLabLogic.VECTOR_DIM, vec.length);
        double norm = 0;
        for (int i = 0; i < vec.length; i++) {
            norm += vec[i] * vec[i];
        }
        assertEquals(1.0, Math.sqrt(norm), 1e-5);
    }

    @Test
    void embed_deterministic() {
        float[] a = SqliteRagLabLogic.embed("混合检索融合");
        float[] b = SqliteRagLabLogic.embed("混合检索融合");
        for (int i = 0; i < a.length; i++) {
            assertEquals(a[i], b[i], 0);
        }
    }

    @Test
    void embed_semantic_overlap_closer_than_unrelated() {
        float[] a = SqliteRagLabLogic.embed("向量检索把文本变成向量做相似度搜索");
        float[] b = SqliteRagLabLogic.embed("embedding把文本映射成向量语义相近距离小");
        float[] c = SqliteRagLabLogic.embed("微信聊天记录存储在本地文件里");
        double related = SqliteRagLabLogic.cosine(a, b);
        double unrelated = SqliteRagLabLogic.cosine(a, c);
        assertTrue(related > unrelated, "语义重叠的应该更近: " + related + " vs " + unrelated);
    }

    // ============= chunkText =============

    @Test
    void chunkText_short_text_single_chunk() {
        assertEquals(List.of("短短短"), SqliteRagLabLogic.chunkText("短短短"));
    }

    @Test
    void chunkText_null_empty() {
        assertTrue(SqliteRagLabLogic.chunkText(null).isEmpty());
        assertTrue(SqliteRagLabLogic.chunkText("   ").isEmpty());
    }

    @Test
    void chunkText_long_text_with_overlap() {
        String text = "甲".repeat(250);
        List<String> chunks = SqliteRagLabLogic.chunkText(text, 90, 18);
        assertTrue(chunks.size() >= 3);
        assertEquals(90, chunks.get(0).length());
    }

    // ============= ftsExpression =============

    @Test
    void ftsExpression_or_joined_quoted_tokens() {
        String expr = SqliteRagLabLogic.ftsExpression("向量 检索");
        assertTrue(expr.contains("\"向\""));
        assertTrue(expr.contains(" OR "));
    }

    @Test
    void ftsExpression_blank_returns_null() {
        assertNull(SqliteRagLabLogic.ftsExpression("   ？！"));
    }

    // ============= rrfFuse =============

    @Test
    void rrfFuse_dual_channel_hit_ranks_first() {
        SqliteRagLabLogic.Hit ftsHit = new SqliteRagLabLogic.Hit(1L, 1L, "t", "c", List.of("fts"), 1.0, 0.0);
        SqliteRagLabLogic.Hit vecHit = new SqliteRagLabLogic.Hit(1L, 1L, "t", "c", List.of("vec"), 0.3, 0.0);
        List<SqliteRagLabLogic.Hit> fused = SqliteRagLabLogic.rrfFuse(List.of(ftsHit), List.of(vecHit), 5);
        assertEquals(1L, fused.get(0).chunkId());
        assertTrue(fused.get(0).engines().containsAll(List.of("fts", "vec")));
        assertEquals(1.0/61 + 1.0/61, fused.get(0).rrfScore(), 1e-9);
    }

    @Test
    void rrfFuse_union_of_channels_no_duplicates() {
        SqliteRagLabLogic.Hit f1 = new SqliteRagLabLogic.Hit(11L, 1L, "t", "c", List.of("fts"), 1.0, 0.0);
        SqliteRagLabLogic.Hit f2 = new SqliteRagLabLogic.Hit(12L, 1L, "t", "c", List.of("fts"), 2.0, 0.0);
        SqliteRagLabLogic.Hit v1 = new SqliteRagLabLogic.Hit(21L, 2L, "t", "c", List.of("vec"), 0.5, 0.0);
        List<SqliteRagLabLogic.Hit> fused = SqliteRagLabLogic.rrfFuse(List.of(f1, f2), List.of(v1, f1), 5);
        Map<Long, List<String>> byId = fused.stream()
                .collect(java.util.stream.Collectors.toMap(
                        SqliteRagLabLogic.Hit::chunkId, h -> h.engines()));
        assertTrue(byId.containsKey(11L));
        assertTrue(byId.containsKey(21L));
        assertEquals(2, byId.get(11L).size());
        assertEquals(1, byId.get(21L).size());
        assertEquals(0.0, fused.get(0).rrfScore() - (1.0 / 61 + 1.0 / 62), 1e-9);
    }

    @Test
    void rrfFuse_rank1_beats_rank2_within_channel() {
        SqliteRagLabLogic.Hit top = new SqliteRagLabLogic.Hit(100L, 1L, "t", "c", List.of("fts"), 1.0, 0.0);
        SqliteRagLabLogic.Hit second = new SqliteRagLabLogic.Hit(101L, 1L, "t", "c", List.of("fts"), 0.5, 0.0);
        List<SqliteRagLabLogic.Hit> fused = SqliteRagLabLogic.rrfFuse(List.of(top, second), List.of(), 5);
        assertEquals(100L, fused.get(0).chunkId());
    }
}
