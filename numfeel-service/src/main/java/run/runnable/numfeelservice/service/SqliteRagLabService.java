package run.runnable.numfeelservice.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import run.runnable.numfeelservice.service.SqliteRagLabLogic.Hit;

/**
 * SQLite RAG 实验室 — "一个文件的 AI 大脑" 业务逻辑层。
 * <p>
 * 用一个真实的 SQLite 数据库文件承载一个最小可用的中文知识库：
 * 关键词通道走 FTS5（中文按字分词 + bm25），语义通道走进程内哈希嵌入 + 余弦近邻，
 * RRF 融合排序。支持提问、盲测对战、投喂三种玩法。
 * <p>
 * 向量层说明：服务端在 JVM 容器里运行，加载 C 版 sqlite-vec 扩展不可移植，
 * 因此使用同构的轻量实现（见 {@link SqliteRagLabLogic}），
 * 向量与索引依然全部落盘在同一个 .db 文件里。
 * <p>
 * 阻塞 I/O 通过 {@code Schedulers.boundedElastic()} 调度，避免阻塞 Netty event loop。
 */
@Service
public class SqliteRagLabService {

    private static final Logger log = LoggerFactory.getLogger(SqliteRagLabService.class);

    /** 单次检索条数 */
    static final int CHANNEL_LIMIT = 5;

    /** 对战每通道卡牌数 */
    static final int BATTLE_LIMIT = 3;

    private Path dataDir;
    private Path dbPath;
    private Connection conn;

    /** 内存索引：chunkId -> 缓存行（含向量），KNN 在进程内完成 */
    private final Map<Long, CachedChunk> vectorTable = new LinkedHashMap<>();

    @PostConstruct
    void init() {
        try {
            dataDir = Files.createTempDirectory("sqlite-rag-lab-");
            dbPath = dataDir.resolve("knowledge.db");
            Class.forName("org.sqlite.JDBC");
            conn = DriverManager.getConnection("jdbc:sqlite:" + dbPath.toAbsolutePath());
            createSchema();
            for (SqliteRagLabCorpus.Entry doc : SqliteRagLabCorpus.DOCS) {
                ingestInternal(doc.title(), doc.text(), "内置语料");
            }
            log.info("SqliteRagLab initialized: {} docs, {} chunks, db={}KB",
                    countDocs(), countChunks(), dbFileSize() / 1024);
        } catch (Exception e) {
            log.error("Failed to initialize SqliteRagLabService", e);
            throw new RuntimeException("SqliteRagLab init failed", e);
        }
    }

    private void createSchema() throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("PRAGMA journal_mode=WAL");
            st.execute("""
                    CREATE TABLE IF NOT EXISTS docs (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      title TEXT NOT NULL,
                      source TEXT NOT NULL DEFAULT '内置语料',
                      created_at TEXT NOT NULL DEFAULT (datetime('now'))
                    )""");
            st.execute("""
                    CREATE TABLE IF NOT EXISTS chunks (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      doc_id INTEGER NOT NULL,
                      content TEXT NOT NULL,
                      embedding BLOB NOT NULL
                    )""");
            st.execute("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content)");
            st.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id)");
        }
    }

    @PreDestroy
    void cleanup() {
        try {
            if (conn != null && !conn.isClosed()) {
                try (Statement st = conn.createStatement()) {
                    st.execute("PRAGMA wal_checkpoint(TRUNCATE)");
                }
                conn.close();
            }
            for (String suffix : new String[]{"", "-wal", "-shm"}) {
                Files.deleteIfExists(dbPath.resolveSibling("knowledge.db" + suffix));
            }
            Files.deleteIfExists(dataDir);
            log.info("SqliteRagLab cleaned up");
        } catch (IOException | SQLException e) {
            log.warn("SqliteRagLab cleanup failed: {}", e.getMessage());
        }
    }

    // ============= 公共 API（Mono 包装，阻塞调度） =============

    public Mono<Map<String, Object>> info() {
        return Mono.fromCallable(this::doInfo).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> ask(String query) {
        return Mono.fromCallable(() -> doHybridSearch(query, CHANNEL_LIMIT))
                .subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> battle(String query) {
        return Mono.fromCallable(() -> doBattle(query)).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> ingest(String title, String text) {
        return Mono.fromCallable(() -> doIngest(title, text)).subscribeOn(Schedulers.boundedElastic());
    }

    // ============= 核心实现 =============

    synchronized Map<String, Object> doInfo() {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("sqliteVersion", queryScalar("SELECT sqlite_version()"));
        res.put("counts", Map.of("docs", countDocs(), "chunks", countChunks()));
        res.put("ftsBackend", "SQLite FTS5（中文按字分词，bm25 排序）");
        res.put("vectorBackend", "进程内哈希嵌入(" + SqliteRagLabLogic.VECTOR_DIM + "维) + 余弦近邻");
        res.put("vectorDim", SqliteRagLabLogic.VECTOR_DIM);
        res.put("dbBytes", dbFileSize());
        return res;
    }

    /** 混合检索：FTS5 关键词通道 + 进程内向量通道 + RRF 融合，带各阶段毫秒计时。 */
    synchronized Map<String, Object> doHybridSearch(String query, int limit) {
        long t0 = System.nanoTime();
        float[] qvec = SqliteRagLabLogic.embed(query);
        long embedDone = System.nanoTime();
        List<Hit> ftsHits = ftsSearch(query, limit);
        long ftsDone = System.nanoTime();
        List<Hit> vecHits = vecSearch(qvec, limit);
        long vecDone = System.nanoTime();
        List<Hit> fused = SqliteRagLabLogic.rrfFuse(ftsHits, vecHits, limit);
        long fuseDone = System.nanoTime();

        Map<String, Object> timings = new LinkedHashMap<>();
        timings.put("fts", round2(ms(ftsDone - embedDone)));
        timings.put("vec", round2(ms(vecDone - ftsDone)));
        timings.put("fuse", round2(ms(fuseDone - vecDone)));
        timings.put("total", round2(ms(fuseDone - t0)));
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("query", query);
        res.put("totalMs", round2(ms(fuseDone - t0)));
        res.put("timings", timings);
        res.put("results", fused.stream().map(SqliteRagLabService::toMap).collect(Collectors.toList()));
        res.put("channels", Map.of(
                "fts", ftsHits.stream().map(SqliteRagLabService::toMap).collect(Collectors.toList()),
                "vec", vecHits.stream().map(SqliteRagLabService::toMap).collect(Collectors.toList())));
        return res;
    }

    /** 盲测对战：两通道各出卡，融合结果作为答案面。 */
    synchronized Map<String, Object> doBattle(String query) {
        List<Hit> ftsHits = ftsSearch(query, BATTLE_LIMIT);
        List<Hit> vecHits = vecSearch(SqliteRagLabLogic.embed(query), BATTLE_LIMIT);
        List<Hit> target = SqliteRagLabLogic.rrfFuse(ftsHits, vecHits, BATTLE_LIMIT);

        List<Map<String, Object>> cards = new ArrayList<>();
        for (Hit h : ftsHits) {
            cards.add(card(h));
        }
        for (Hit h : vecHits) {
            boolean dup = cards.stream().anyMatch(c -> ((Number) c.get("chunkId")).longValue() == h.chunkId());
            if (!dup) {
                cards.add(card(h));
            }
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("query", query);
        res.put("cards", cards);
        res.put("target", target.stream().map(h -> (int) h.chunkId()).toList());
        return res;
    }

    private Map<String, Object> card(Hit h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chunkId", (int) h.chunkId());
        m.put("title", h.title());
        m.put("content", truncate(h.content(), 64));
        return m;
    }

    synchronized Map<String, Object> doIngest(String title, String text) {
        long t0 = System.nanoTime();
        int docId = ingestInternal(title, text, "用户投喂");
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("docId", docId);
        res.put("chunks", countChunks());
        res.put("ingestMs", round2(ms(System.nanoTime() - t0)));
        return res;
    }

    /** 切块 + 向量化 + 落盘（chunks BLOB、FTS5、内存向量表），返回 doc id。 */
    int ingestInternal(String title, String text, String source) {
        long docId = -1;
        try {
            conn.setAutoCommit(false);
            try (PreparedStatement docIns = conn.prepareStatement(
                    "INSERT INTO docs (title, source) VALUES (?, ?)")) {
                docIns.setString(1, title);
                docIns.setString(2, source);
                docIns.executeUpdate();
                try (Statement st = conn.createStatement();
                     ResultSet rs = st.executeQuery("SELECT last_insert_rowid()")) {
                    docId = rs.next() ? rs.getLong(1) : -1;
                }
            }
            for (String piece : SqliteRagLabLogic.chunkText(text)) {
                float[] vec = SqliteRagLabLogic.embed(piece);
                long chunkId;
                try (PreparedStatement chunkIns = conn.prepareStatement(
                        "INSERT INTO chunks (doc_id, content, embedding) VALUES (?, ?, ?)")) {
                    chunkIns.setLong(1, docId);
                    chunkIns.setString(2, piece);
                    chunkIns.setBytes(3, SqliteRagLabLogic.toBlob(vec));
                    chunkIns.executeUpdate();
                    try (Statement st = conn.createStatement();
                         ResultSet rs = st.executeQuery("SELECT last_insert_rowid()")) {
                        chunkId = rs.next() ? rs.getLong(1) : -1;
                    }
                }
                try (PreparedStatement ftsIns = conn.prepareStatement(
                        "INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)")) {
                    ftsIns.setLong(1, chunkId);
                    ftsIns.setString(2, String.join(" ", SqliteRagLabLogic.charTokens(piece)));
                    ftsIns.executeUpdate();
                }
                vectorTable.put(chunkId, new CachedChunk(title, piece, vec));
            }
            conn.commit();
        } catch (SQLException e) {
            quietRollback();
            throw new RuntimeException("ingest failed", e);
        } finally {
            quietAutoCommitTrue();
        }
        return (int) docId;
    }

    /** 关键词通道：FTS5 匹配 + bm25，分值越小相关度越高（统一转成代理升序分值不方便，这里直接存 bm25 原值）。 */
    List<Hit> ftsSearch(String query, int limit) {
        String expr = SqliteRagLabLogic.ftsExpression(query);
        List<Hit> hits = new ArrayList<>();
        if (expr == null) {
            return hits;
        }
        String sql = """
                SELECT c.id, c.doc_id, c.content, d.title, bm25(chunks_fts) AS score
                FROM chunks_fts f
                JOIN chunks c ON c.id = f.rowid
                JOIN docs d ON d.id = c.doc_id
                WHERE chunks_fts MATCH ?
                ORDER BY score LIMIT ?""";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, expr);
            ps.setInt(2, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    hits.add(new Hit(rs.getLong("id"), rs.getLong("doc_id"),
                            rs.getString("title"), rs.getString("content"),
                            List.of("fts"), rs.getDouble("score"), 0.0));
                }
            }
        } catch (SQLException e) {
            log.warn("sqlite-rag fts search failed: {}", e.getMessage());
        }
        return hits;
    }

    /** 向量通道：进程内余弦近邻（距离 = 1 - 相似度，升序 = 最相关在前）。 */
    List<Hit> vecSearch(float[] qvec, int limit) {
        record Scored(long chunkId, double distance) {}
        List<Scored> scored = new ArrayList<>();
        for (Map.Entry<Long, CachedChunk> e : vectorTable.entrySet()) {
            scored.add(new Scored(e.getKey(), 1.0 - SqliteRagLabLogic.cosine(qvec, e.getValue().vector())));
        }
        return scored.stream()
                .sorted(Comparator.comparingDouble(Scored::distance))
                .limit(limit)
                .map(s -> {
                    CachedChunk c = vectorTable.get(s.chunkId());
                    return new Hit(s.chunkId(), -1L, c.title(), c.content(), List.of("vec"), s.distance(), 0.0);
                })
                .toList();
    }

    // ============= 统计 =============

    private int countDocs() {
        return (int) countRows("docs");
    }

    private int countChunks() {
        return (int) countRows("chunks");
    }

    private long countRows(String table) {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM " + table)) {
            return rs.next() ? rs.getLong(1) : 0;
        } catch (SQLException e) {
            return 0;
        }
    }

    private String queryScalar(String sql) {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : "unknown";
        } catch (SQLException e) {
            return "unknown";
        }
    }

    long dbFileSize() {
        File f = dbPath.toFile();
        return f.exists() ? f.length() : 0L;
    }

    private void quietRollback() {
        try {
            conn.rollback();
        } catch (SQLException ignored) {
        }
    }

    private void quietAutoCommitTrue() {
        try {
            conn.setAutoCommit(true);
        } catch (SQLException ignored) {
        }
    }

    private static String truncate(String s, int n) {
        return s.length() <= n ? s : s.substring(0, n);
    }

    private static double ms(double ns) {
        return ns / 1_000_000.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static Map<String, Object> toMap(Hit h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chunkId", (int) h.chunkId());
        m.put("title", h.title());
        m.put("content", h.content());
        m.put("engines", h.engines());
        m.put("engine", h.engines().get(0));
        m.put("rrf", round2(h.rrfScore() * 1000) / 1000.0);
        return m;
    }

    private record CachedChunk(String title, String content, float[] vector) {}
}
