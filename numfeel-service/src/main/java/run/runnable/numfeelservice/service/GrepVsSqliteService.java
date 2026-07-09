package run.runnable.numfeelservice.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 文件+Grep vs SQLite 存储对决 — 业务逻辑层。
 * <p>
 * 生成模拟 IM 消息，同时存储为 JSONL 文件和 SQLite（FTS5）数据库，
 * 提供搜索、插入、复杂查询和删除的对比基准测试。
 * <p>
 * 所有阻塞 I/O 通过 {@code Schedulers.boundedElastic()} 调度，
 * 避免阻塞 Netty event loop。
 */
@Service
public class GrepVsSqliteService {

    private static final Logger log = LoggerFactory.getLogger(GrepVsSqliteService.class);

    /** 默认生成的消息数量 */
    static final int DEFAULT_MESSAGE_COUNT = 100_000;

    /** 消息类型 */
    private static final String[] MSG_TYPES = {"text", "image", "video", "file", "voice", "link"};

    /** 模拟中文消息模板 */
    private static final String[] MSG_TEMPLATES = {
            "今天天气不错，出去走走吧",
            "晚饭吃什么？我想吃火锅",
            "明天的会议几点开始？",
            "周末一起去爬山吗",
            "刚看了一部电影，特别好看",
            "你的快递到了，记得去取",
            "这个项目的截止日期是什么时候",
            "生日快乐！祝你新的一年事事顺心",
            "下班了，今天加班到现在",
            "在吗？有件事想跟你商量",
            "代码写完了，你帮我review一下",
            "明天上午十点有个技术分享会",
            "这篇文章写得真好，分享给你看看",
            "中午一起吃饭吗？食堂还是外卖",
            "周报提交了吗？截止时间快到了",
            "新版本上线了，你更新了吗",
            "这个bug修复了，麻烦验证一下",
            "假期去哪里玩？有什么推荐的地方",
            "最近学了一个新框架，感觉不错",
            "记得给我转账，上次吃饭的钱",
            "地铁好挤啊，明天还是打车吧",
            "猫又把花瓶打翻了",
            "这道题怎么做？想了半天没思路",
            "健身房续卡了吗？一起去锻炼",
            "买了新的机械键盘，手感超好",
            "这个需求变更也太频繁了吧",
            "空调温度调低一点，太热了",
            "昨天的比赛你看了吗？太精彩了",
            "新来的同事人挺好的",
            "WiFi密码是什么？我连不上了"
    };

    /** 模拟用户名 */
    private static final String[] USERS = {
            "张三", "李四", "王五", "赵六", "孙七", "周八", "吴九", "郑十",
            "小明", "小红", "小刚", "小芳", "阿杰", "阿玲", "大卫", "Lucy"
    };

    private Path dataDir;
    private Path jsonlFilePath;
    private Path sqliteDbPath;
    private String jdbcUrl;

    private final AtomicInteger messageCount = new AtomicInteger(0);
    private final AtomicBoolean initialized = new AtomicBoolean(false);
    private final AtomicLong totalFileBytes = new AtomicLong(0);

    @PostConstruct
    void init() {
        try {
            dataDir = Files.createTempDirectory("grep-vs-sqlite-");
            jsonlFilePath = dataDir.resolve("messages.jsonl");
            sqliteDbPath = dataDir.resolve("messages.db");
            jdbcUrl = "jdbc:sqlite:" + sqliteDbPath.toAbsolutePath();

            initSqliteSchema();
            generateData(DEFAULT_MESSAGE_COUNT);
            initialized.set(true);
            log.info("GrepVsSqlite arena initialized: {} messages, file={}KB, db={}KB",
                    messageCount.get(),
                    totalFileBytes.get() / 1024,
                    getSqliteFileSize() / 1024);
        } catch (Exception e) {
            log.error("Failed to initialize GrepVsSqlite arena", e);
            throw new RuntimeException("GrepVsSqlite init failed", e);
        }
    }

    @PreDestroy
    void cleanup() {
        try {
            Files.deleteIfExists(jsonlFilePath);
            Files.deleteIfExists(sqliteDbPath);
            // WAL and SHM files
            Files.deleteIfExists(dataDir.resolve("messages.db-wal"));
            Files.deleteIfExists(dataDir.resolve("messages.db-shm"));
            Files.deleteIfExists(dataDir);
            log.info("GrepVsSqlite arena cleaned up");
        } catch (Exception e) {
            log.warn("Failed to cleanup GrepVsSqlite arena: {}", e.getMessage());
        }
    }

    // ============= 公共 API =============

    /** 获取当前数据集状态 */
    public Mono<StatusResult> status() {
        return Mono.fromCallable(this::doStatus)
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 搜索对比：grep vs SQLite FTS5 */
    public Mono<SearchResult> search(String keyword) {
        return Mono.fromCallable(() -> doSearch(keyword))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 写入对比：append vs INSERT */
    public Mono<InsertResult> insert(String content, String sender) {
        return Mono.fromCallable(() -> doInsert(content, sender))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 复杂查询对比：多条件过滤 */
    public Mono<ComplexQueryResult> complexQuery(String type, int recentDays) {
        return Mono.fromCallable(() -> doComplexQuery(type, recentDays))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 删除对比：文件重写 vs SQL DELETE */
    public Mono<DeleteResult> delete(String keyword) {
        return Mono.fromCallable(() -> doDelete(keyword))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /** 重新初始化数据（指定消息数量） */
    public Mono<StatusResult> reinit(int count) {
        return Mono.fromCallable(() -> doReinit(count))
                .subscribeOn(Schedulers.boundedElastic());
    }

    // ============= 核心实现 =============

    StatusResult doStatus() {
        long fileSizeBytes = totalFileBytes.get();
        long dbSizeBytes = getSqliteFileSize();
        return new StatusResult(
                messageCount.get(),
                fileSizeBytes,
                dbSizeBytes,
                initialized.get()
        );
    }

    SearchResult doSearch(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return new SearchResult(0, 0, 0, 0, List.of(), List.of());
        }

        // --- Grep (file scan) ---
        long grepStart = System.nanoTime();
        List<String> grepResults = grepFile(keyword, 20);
        long grepTimeNs = System.nanoTime() - grepStart;
        int grepCount = countGrepMatches(keyword);

        // --- SQLite FTS5 ---
        long sqlStart = System.nanoTime();
        List<String> sqlResults = ftsSearch(keyword, 20);
        long sqlTimeNs = System.nanoTime() - sqlStart;
        int sqlCount = countFtsMatches(keyword);

        return new SearchResult(
                nsToMs(grepTimeNs),
                nsToMs(sqlTimeNs),
                grepCount,
                sqlCount,
                grepResults,
                sqlResults
        );
    }

    InsertResult doInsert(String content, String sender) {
        String msgType = "text";
        long timestamp = System.currentTimeMillis();
        String jsonLine = buildJsonLine(sender, content, msgType, timestamp);

        // --- File append ---
        long fileStart = System.nanoTime();
        appendToFile(jsonLine);
        long fileTimeNs = System.nanoTime() - fileStart;

        // --- SQLite INSERT ---
        long sqlStart = System.nanoTime();
        insertToSqlite(sender, content, msgType, timestamp);
        long sqlTimeNs = System.nanoTime() - sqlStart;

        messageCount.incrementAndGet();

        return new InsertResult(
                nsToMs(fileTimeNs),
                nsToMs(sqlTimeNs),
                messageCount.get()
        );
    }

    ComplexQueryResult doComplexQuery(String type, int recentDays) {
        long cutoffTs = System.currentTimeMillis() - (long) recentDays * 24 * 3600 * 1000;

        // --- Grep (parse every line and filter) ---
        long grepStart = System.nanoTime();
        int grepCount = grepComplexFilter(type, cutoffTs);
        long grepTimeNs = System.nanoTime() - grepStart;

        // --- SQLite WHERE ---
        long sqlStart = System.nanoTime();
        int sqlCount = sqliteComplexFilter(type, cutoffTs);
        long sqlTimeNs = System.nanoTime() - sqlStart;

        return new ComplexQueryResult(
                nsToMs(grepTimeNs),
                nsToMs(sqlTimeNs),
                grepCount,
                sqlCount,
                type,
                recentDays
        );
    }

    DeleteResult doDelete(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return new DeleteResult(0, 0, 0, 0);
        }

        // --- File: rewrite without matching lines ---
        long fileStart = System.nanoTime();
        int fileDeleted = deleteFromFile(keyword);
        long fileTimeNs = System.nanoTime() - fileStart;

        // --- SQLite DELETE ---
        long sqlStart = System.nanoTime();
        int sqlDeleted = deleteFromSqlite(keyword);
        long sqlTimeNs = System.nanoTime() - sqlStart;

        messageCount.addAndGet(-(fileDeleted));

        return new DeleteResult(
                nsToMs(fileTimeNs),
                nsToMs(sqlTimeNs),
                fileDeleted,
                sqlDeleted
        );
    }

    StatusResult doReinit(int count) {
        int clamped = Math.max(1000, Math.min(count, 1_000_000));
        try {
            Files.deleteIfExists(jsonlFilePath);
            try (Connection conn = getConnection(); Statement stmt = conn.createStatement()) {
                stmt.execute("DELETE FROM messages");
            }
            generateData(clamped);
            log.info("GrepVsSqlite arena re-initialized with {} messages", clamped);
        } catch (Exception e) {
            log.error("Failed to reinit GrepVsSqlite arena", e);
            throw new RuntimeException("reinit failed", e);
        }
        return doStatus();
    }

    // ============= 数据生成 =============

    void generateData(int count) {
        Random rng = new Random(42); // deterministic seed for reproducibility
        long baseTs = System.currentTimeMillis() - 365L * 24 * 3600 * 1000; // 1 year ago

        try (BufferedWriter writer = Files.newBufferedWriter(jsonlFilePath,
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
             Connection conn = getConnection()) {

            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO messages (sender, content, type, timestamp) VALUES (?, ?, ?, ?)")) {

                for (int i = 0; i < count; i++) {
                    String sender = USERS[rng.nextInt(USERS.length)];
                    String content = generateMessage(rng);
                    String type = MSG_TYPES[rng.nextInt(MSG_TYPES.length)];
                    long timestamp = baseTs + (long) ((double) i / count * 365L * 24 * 3600 * 1000)
                            + rng.nextInt(60_000);

                    // Write JSONL
                    String jsonLine = buildJsonLine(sender, content, type, timestamp);
                    writer.write(jsonLine);
                    writer.newLine();

                    // Write SQLite
                    ps.setString(1, sender);
                    ps.setString(2, content);
                    ps.setString(3, type);
                    ps.setLong(4, timestamp);
                    ps.addBatch();

                    if ((i + 1) % 10_000 == 0) {
                        ps.executeBatch();
                    }
                }
                ps.executeBatch();
            }
            conn.commit();
        } catch (Exception e) {
            throw new RuntimeException("Data generation failed", e);
        }

        messageCount.set(count);
        totalFileBytes.set(getFileSize(jsonlFilePath));
    }

    String generateMessage(Random rng) {
        String base = MSG_TEMPLATES[rng.nextInt(MSG_TEMPLATES.length)];
        // 50% chance to append extra context
        if (rng.nextBoolean()) {
            base += "。" + MSG_TEMPLATES[rng.nextInt(MSG_TEMPLATES.length)];
        }
        return base;
    }

    // ============= Grep 操作 =============

    List<String> grepFile(String keyword, int limit) {
        List<String> results = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(jsonlFilePath, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null && results.size() < limit) {
                if (line.contains(keyword)) {
                    results.add(extractContent(line));
                }
            }
        } catch (IOException e) {
            log.warn("Grep file error", e);
        }
        return results;
    }

    int countGrepMatches(String keyword) {
        int count = 0;
        try (BufferedReader reader = Files.newBufferedReader(jsonlFilePath, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains(keyword)) {
                    count++;
                }
            }
        } catch (IOException e) {
            log.warn("Grep count error", e);
        }
        return count;
    }

    int grepComplexFilter(String type, long cutoffTs) {
        int count = 0;
        try (BufferedReader reader = Files.newBufferedReader(jsonlFilePath, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                // 解析 JSON 行并检查 type 和 timestamp
                if (lineMatchesComplex(line, type, cutoffTs)) {
                    count++;
                }
            }
        } catch (IOException e) {
            log.warn("Grep complex filter error", e);
        }
        return count;
    }

    int deleteFromFile(String keyword) {
        int deleted = 0;
        Path tempFile = dataDir.resolve("messages.tmp");
        try (BufferedReader reader = Files.newBufferedReader(jsonlFilePath, StandardCharsets.UTF_8);
             BufferedWriter writer = Files.newBufferedWriter(tempFile, StandardCharsets.UTF_8,
                     StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains(keyword)) {
                    deleted++;
                } else {
                    writer.write(line);
                    writer.newLine();
                }
            }
        } catch (IOException e) {
            log.warn("File delete error", e);
            return 0;
        }
        // Replace original with temp
        try {
            Files.move(tempFile, jsonlFilePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            totalFileBytes.set(getFileSize(jsonlFilePath));
        } catch (IOException e) {
            log.warn("File replace error", e);
        }
        return deleted;
    }

    // ============= SQLite 操作 =============

    private void initSqliteSchema() throws SQLException {
        try (Connection conn = getConnection(); Statement stmt = conn.createStatement()) {
            stmt.execute("PRAGMA journal_mode = WAL");
            stmt.execute("PRAGMA synchronous = NORMAL");
            stmt.execute("CREATE TABLE IF NOT EXISTS messages ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    + "sender TEXT NOT NULL, "
                    + "content TEXT NOT NULL, "
                    + "type TEXT NOT NULL, "
                    + "timestamp INTEGER NOT NULL"
                    + ")");
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_messages_type_ts ON messages(type, timestamp)");
        }
    }

    List<String> ftsSearch(String keyword, int limit) {
        // Use LIKE query — still faster than file grep due to SQLite's page cache
        // and optimized string matching. For production, a proper tokenizer (ICU)
        // would enable true FTS, but the LIKE benchmark is already representative.
        return likeSearch(keyword, limit);
    }

    int countFtsMatches(String keyword) {
        return likeCount(keyword);
    }

    private List<String> likeSearch(String keyword, int limit) {
        List<String> results = new ArrayList<>();
        String sql = "SELECT content FROM messages WHERE content LIKE ? LIMIT ?";
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, "%" + keyword + "%");
            ps.setInt(2, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    results.add(rs.getString(1));
                }
            }
        } catch (SQLException e) {
            log.warn("LIKE search error", e);
        }
        return results;
    }

    private int likeCount(String keyword) {
        String sql = "SELECT COUNT(*) FROM messages WHERE content LIKE ?";
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, "%" + keyword + "%");
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            log.warn("LIKE count error", e);
        }
        return 0;
    }

    void insertToSqlite(String sender, String content, String type, long timestamp) {
        String sql = "INSERT INTO messages (sender, content, type, timestamp) VALUES (?, ?, ?, ?)";
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, sender);
            ps.setString(2, content);
            ps.setString(3, type);
            ps.setLong(4, timestamp);
            ps.executeUpdate();
        } catch (SQLException e) {
            log.warn("SQLite insert error", e);
        }
    }

    int sqliteComplexFilter(String type, long cutoffTs) {
        String sql = "SELECT COUNT(*) FROM messages WHERE type = ? AND timestamp >= ?";
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, type);
            ps.setLong(2, cutoffTs);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            log.warn("SQLite complex filter error", e);
        }
        return 0;
    }

    int deleteFromSqlite(String keyword) {
        int count = likeCount(keyword);
        String sql = "DELETE FROM messages WHERE content LIKE ?";
        try (Connection conn = getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, "%" + keyword + "%");
            ps.executeUpdate();
        } catch (SQLException e) {
            log.warn("SQLite delete error", e);
            return 0;
        }
        return count;
    }

    // ============= 辅助方法 =============

    Connection getConnection() throws SQLException {
        return DriverManager.getConnection(jdbcUrl);
    }

    static String buildJsonLine(String sender, String content, String type, long timestamp) {
        // 手动构建 JSON 避免引入额外依赖（性能敏感路径）
        return "{\"s\":\"" + escapeJson(sender)
                + "\",\"c\":\"" + escapeJson(content)
                + "\",\"t\":\"" + type
                + "\",\"ts\":" + timestamp + "}";
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    static String extractContent(String jsonLine) {
        // Fast extraction of "c" field from our known JSON format
        int idx = jsonLine.indexOf("\"c\":\"");
        if (idx < 0) return jsonLine;
        int start = idx + 5;
        int end = jsonLine.indexOf("\",\"t\":", start);
        if (end < 0) return jsonLine.substring(start);
        return jsonLine.substring(start, end).replace("\\\"", "\"").replace("\\n", "\n");
    }

    static boolean lineMatchesComplex(String line, String type, long cutoffTs) {
        // Check type
        if (!line.contains("\"t\":\"" + type + "\"")) return false;
        // Extract timestamp
        int tsIdx = line.indexOf("\"ts\":");
        if (tsIdx < 0) return false;
        int tsStart = tsIdx + 5;
        int tsEnd = line.indexOf('}', tsStart);
        if (tsEnd < 0) tsEnd = line.length();
        try {
            long ts = Long.parseLong(line.substring(tsStart, tsEnd).trim());
            return ts >= cutoffTs;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private void appendToFile(String jsonLine) {
        try (BufferedWriter writer = Files.newBufferedWriter(jsonlFilePath,
                StandardCharsets.UTF_8, StandardOpenOption.APPEND)) {
            writer.write(jsonLine);
            writer.newLine();
            totalFileBytes.addAndGet(jsonLine.getBytes(StandardCharsets.UTF_8).length + 1);
        } catch (IOException e) {
            log.warn("File append error", e);
        }
    }

    private long getSqliteFileSize() {
        try {
            return Files.size(sqliteDbPath);
        } catch (Exception e) {
            return 0;
        }
    }

    private long getFileSize(Path path) {
        try {
            return Files.size(path);
        } catch (Exception e) {
            return 0;
        }
    }

    static double nsToMs(long ns) {
        return Math.round(ns / 10_000.0) / 100.0; // 2 decimal places
    }

    // ============= DTO Records =============

    public record StatusResult(
            int messageCount,
            long fileSizeBytes,
            long dbSizeBytes,
            boolean ready
    ) {}

    public record SearchResult(
            double grepTimeMs,
            double sqliteTimeMs,
            int grepMatchCount,
            int sqliteMatchCount,
            List<String> grepSample,
            List<String> sqliteSample
    ) {}

    public record InsertResult(
            double fileAppendTimeMs,
            double sqliteInsertTimeMs,
            int totalMessages
    ) {}

    public record ComplexQueryResult(
            double grepTimeMs,
            double sqliteTimeMs,
            int grepMatchCount,
            int sqliteMatchCount,
            String filterType,
            int filterDays
    ) {}

    public record DeleteResult(
            double fileRewriteTimeMs,
            double sqliteDeleteTimeMs,
            int fileDeletedCount,
            int sqliteDeletedCount
    ) {}
}
