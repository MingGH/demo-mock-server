package run.runnable.numfeelservice.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * SQLite RAG 实验室 — 纯逻辑函数集（无状态、无 I/O），便于独立单元测试。
 * <p>
 * 嵌入模型：单字(权重 0.55)+相邻二元组(权重 1) → FNV-1a 哈希 → 96 维 → L2 归一化。
 * 前端展示页会给出同名算法说明，后端与前端只共享"语义"不复用代码。
 */
public final class SqliteRagLabLogic {

    private SqliteRagLabLogic() {
    }

    /** 向量维度 */
    public static final int VECTOR_DIM = 96;

    /** RRF 常数 k（行业常用值 60） */
    public static final int RRF_K = 60;

    /** FTS OR 查询最多 token 数 */
    public static final int MAX_FTS_TOKENS = 12;

    /** 中文按单字切分、拉丁词保留整体、小写，空白与标点剔除。 */
    public static List<String> charTokens(String text) {
        if (text == null || text.strip().isEmpty()) {
            return List.of();
        }
        String s = text.strip();
        List<String> tokens = new ArrayList<>();
        StringBuilder latin = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (isLatinWordChar(ch)) {
                latin.append(Character.toLowerCase(ch));
                continue;
            }
            if (latin.length() > 0) {
                tokens.add(latin.toString());
                latin.setLength(0);
            }
            if (isCjk(ch)) {
                tokens.add(String.valueOf(ch));
            }
        }
        if (latin.length() > 0) {
            tokens.add(latin.toString());
        }
        return tokens;
    }

    /** FTS5 OR 查询表达式："t1" OR "t2"，纯空白/纯标点返回 null。 */
    public static String ftsExpression(String query) {
        List<String> tokens = charTokens(query).stream()
                .limit(MAX_FTS_TOKENS)
                .toList();
        if (tokens.isEmpty()) {
            return null;
        }
        return tokens.stream().map(t -> "\"" + t + "\"").collect(Collectors.joining(" OR "));
    }

    /** 哈希嵌入：单字权重 0.55、相邻二元组权重 1，L2 归一化。 */
    public static float[] embed(String text) {
        List<String> tokens = charTokens(text);
        Map<String, Integer> counts = new HashMap<>();
        for (int i = 0; i < tokens.size(); i++) {
            counts.merge(tokens.get(i), 1, Integer::sum);
            if (i + 1 < tokens.size()) {
                counts.merge(tokens.get(i) + tokens.get(i + 1), 1, Integer::sum);
            }
        }
        float[] vec = new float[VECTOR_DIM];
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            float weight = e.getKey().length() > 1 ? 1.0f : 0.55f;
            int h = fnv1a(e.getKey());
            int idx = Math.abs(h) % VECTOR_DIM;
            float sign = ((h >>> 31) & 1) == 1 ? -1f : 1f;
            vec[idx] += sign * weight * e.getValue();
        }
        double norm = 0;
        for (float v : vec) {
            norm += v * v;
        }
        norm = Math.sqrt(norm);
        if (norm > 1e-9) {
            for (int i = 0; i < VECTOR_DIM; i++) {
                vec[i] /= (float) norm;
            }
        }
        return vec;
    }

    /** 余弦相似度（要求输入 L2 归一化后的同维向量）。 */
    public static double cosine(float[] a, float[] b) {
        double dot = 0;
        for (int i = 0; i < VECTOR_DIM; i++) {
            dot += a[i] * b[i];
        }
        return dot;
    }

    /** FNV-1a 32 位哈希。 */
    static int fnv1a(String s) {
        int h = 0x811c9dc5;
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 0x01000193;
        }
        return h;
    }

    /** 文本切块：滑动窗口，单块 chunkSize、重叠 overlap、去掉不足 8 字的尾块。 */
    public static List<String> chunkText(String text, int chunkSize, int overlap) {
        if (text == null) {
            return List.of();
        }
        String clean = text.replaceAll("\\s+", " ").trim();
        if (clean.isEmpty()) {
            return List.of();
        }
        if (clean.length() <= chunkSize) {
            return List.of(clean);
        }
        List<String> chunks = new ArrayList<>();
        int step = Math.max(1, chunkSize - overlap);
        for (int i = 0; i < clean.length(); i += step) {
            int end = Math.min(clean.length(), i + chunkSize);
            String piece = clean.substring(i, end).trim();
            if (piece.length() >= 8) {
                chunks.add(piece);
            }
            if (end >= clean.length()) {
                break;
            }
        }
        return chunks;
    }

    /** 默认切块参数：单块 90 字、重叠 18 字。 */
    public static List<String> chunkText(String text) {
        return chunkText(text, 90, 18);
    }

    /** float[] → big-endian BLOB（SQLite 存储用）。 */
    public static byte[] toBlob(float[] vec) {
        byte[] bytes = new byte[vec.length * Float.BYTES];
        for (int i = 0; i < vec.length; i++) {
            int bits = Float.floatToIntBits(vec[i]);
            bytes[i * 4] = (byte) (bits >>> 24);
            bytes[i * 4 + 1] = (byte) (bits >>> 16);
            bytes[i * 4 + 2] = (byte) (bits >>> 8);
            bytes[i * 4 + 3] = (byte) bits;
        }
        return bytes;
    }

    private static boolean isLatinWordChar(char ch) {
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_';
    }

    private static boolean isCjk(char ch) {
        return (ch >= 0x4E00 && ch <= 0x9FFF) || (ch >= 0x3400 && ch <= 0x4DBF);
    }

    /** 检索条目：engines 是命中的通道列表（fts / vec，双命中的融合条目有两个元素）。 */
    public record Hit(long chunkId, long docId, String title, String content,
                      List<String> engines, double rawScore, double rrfScore) {}

    /**
     * RRF 融合：每通道第 k 名贡献 1/(k + RRF_K)，把所有通道的倒数排名相加后降序。
     *
     * @param ftsHits 关键词通道（按相关度降序排列）
     * @param vecHits 向量通道（按距离升序 = 相关度降序）
     * @param limit   返回前 N
     */
    public static List<Hit> rrfFuse(List<Hit> ftsHits, List<Hit> vecHits, int limit) {
        Map<Long, Double> scores = new HashMap<>();
        Map<Long, List<String>> engineSets = new LinkedHashMap<>();
        Map<Long, Hit> firstSeen = new LinkedHashMap<>();
        for (List<Hit> channel : List.of(ftsHits, vecHits)) {
            for (int i = 0; i < channel.size(); i++) {
                Hit h = channel.get(i);
                scores.merge(h.chunkId(), 1.0 / (RRF_K + i + 1), Double::sum);
                engineSets.computeIfAbsent(h.chunkId(), k -> new ArrayList<>())
                        .add(h.engines().get(0));
                firstSeen.putIfAbsent(h.chunkId(), h);
            }
        }
        return firstSeen.values().stream()
                .map(h -> new Hit(h.chunkId(), h.docId(), h.title(), h.content(),
                        List.copyOf(engineSets.get(h.chunkId())), h.rawScore(),
                        scores.getOrDefault(h.chunkId(), 0.0)))
                .sorted(Comparator.comparingDouble((Hit h) -> h.rrfScore()).reversed())
                .limit(limit)
                .toList();
    }
}
