package run.runnable.numfeelservice.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.web.ApiException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 增删改查引擎大赛 — 业务逻辑层。
 * <p>
 * 同一份 key-value 数据（模拟订单串），分别跑在三种引擎上做基准测试：
 * <ul>
 *   <li><b>text</b>：一个普通文本文件（key|value 每行一条），查询 = 全量读文件逐行扫，
 *       更新/删除 = 全量重写，插入 = 追加一行 —— 「你自己造的数据库」</li>
 *   <li><b>mysql</b>：远程 MySQL 表，主键索引 + 一次网络往返</li>
 *   <li><b>caffeine</b>：进程内内存缓存（纯内存哈希表）</li>
 * </ul>
 * 每个引擎维护自己的数据就绪状态（当前行数 + 脏标记），run 时发现不匹配或写脏则自动重建，
 * 前端无需先调 reset。同一引擎的基准测试用 {@link ReentrantLock} 串行化，避免多用户互相污染数字。
 * <p>
 * text/caffeine 是纯内存/磁盘阻塞操作，统一调度到 {@code Schedulers.boundedElastic()}；
 * mysql 走 R2DBC 反应式链，锁在订阅时获取、doFinally 里释放。
 */
@Service
public class CrudRaceService {

    private static final Logger log = LoggerFactory.getLogger(CrudRaceService.class);

    /** 数据行数上限 */
    static final int MAX_COUNT = 100_000;
    /** 单次基准操作次数上限 */
    static final int MAX_OPS = 2000;

    /** text 引擎的数据文件（临时目录，服务重启即重建） */
    private Path dataFile;

    /** text 引擎锁 + 就绪状态 */
    private final ReentrantLock textLock = new ReentrantLock();
    private int textCount = -1;
    private boolean textDirty = true;

    @PostConstruct
    void init() {
        try {
            dataFile = Files.createTempFile("crud-race-", ".txt");
            log.info("crud-race text engine data file: {}", dataFile);
        } catch (IOException e) {
            log.error("crud-race init failed: {}", e.getMessage());
            throw new RuntimeException("crud-race init failed", e);
        }
    }

    @PreDestroy
    void cleanup() {
        try {
            Files.deleteIfExists(dataFile);
        } catch (IOException e) {
            log.warn("crud-race cleanup failed: {}", e.getMessage());
        }
    }

    // ============= 对外入口 =============

    /**
     * 在指定引擎上跑一轮基准测试。
     *
     * @param engine 引擎名：text / mysql / caffeine
     * @param count  数据行数（1 - 100,000）
     * @param op     操作类型：get / update / insert / delete
     * @param ops    操作次数（1 - 2000）
     * @return 基准测试结果（含准备数据耗时，与基准耗时分开统计）
     */
    public Mono<RunResult> run(String engine, int count, String op, int ops) {
        return switch (engine) {
            case "text" -> Mono.fromCallable(() -> doRunText(count, op, ops))
                    .subscribeOn(Schedulers.boundedElastic());
            case "mysql", "caffeine" -> Mono.error(ApiException.badRequest(
                    "engine '" + engine + "' not implemented yet"));
            default -> Mono.error(ApiException.badRequest("unknown engine: " + engine));
        };
    }

    // ============= text 引擎 =============

    /**
     * text 引擎基准测试（阻塞实现，调用方负责调度到 boundedElastic）。
     *
     * @param count 数据行数
     * @param op    操作类型：get / update / insert / delete
     * @param ops   操作次数
     * @return 基准结果
     */
    RunResult doRunText(int count, String op, int ops) {
        textLock.lock();
        try {
            long resetStart = System.nanoTime();
            if (textCount != count || textDirty) {
                resetText(count);
                textCount = count;
                textDirty = false;
            }
            long resetMs = elapsedMs(resetStart);

            long start = System.nanoTime();
            int ok = 0;
            for (int i = 0; i < ops; i++) {
                boolean success = switch (op) {
                    case "get" -> textGet(keyOf(randomIndex(count))) != null;
                    case "update" -> textUpdate(keyOf(randomIndex(count)), valueOf(randomIndex(1_000_000)));
                    case "insert" -> {
                        textInsert(keyOf(1_000_000 + i), valueOf(randomIndex(1_000_000)));
                        yield true;
                    }
                    case "delete" -> textDelete(keyOf(randomIndex(count)));
                    default -> false;
                };
                if (success) ok++;
            }
            long totalNs = System.nanoTime() - start;
            if ("insert".equals(op) || "delete".equals(op)) {
                textDirty = true;
            }
            return buildResult("text", op, count, ops, ok, resetMs, totalNs, fileSize());
        } catch (IOException e) {
            log.warn("crud-race text engine error: {}", e.getMessage());
            throw new RuntimeException("text engine error: " + e.getMessage(), e);
        } finally {
            textLock.unlock();
        }
    }

    /** 重建 text 数据文件：写入 count 行 seed 数据。 */
    void resetText(int count) throws IOException {
        StringBuilder sb = new StringBuilder(count * 44);
        for (int i = 0; i < count; i++) {
            sb.append(keyOf(i)).append('|').append(valueOf(i)).append('\n');
        }
        Files.writeString(dataFile, sb.toString(), StandardCharsets.UTF_8);
    }

    /**
     * text 引擎查询：读整个文件逐行扫描，返回命中的 value；未命中返回 null。
     */
    String textGet(String key) throws IOException {
        List<String> lines = Files.readAllLines(dataFile, StandardCharsets.UTF_8);
        for (String line : lines) {
            int sep = line.indexOf('|');
            if (sep > 0 && line.substring(0, sep).equals(key)) {
                return line.substring(sep + 1);
            }
        }
        return null;
    }

    /**
     * text 引擎更新：读全文件，替换命中行，整个文件写回。
     *
     * @return 是否命中并更新
     */
    boolean textUpdate(String key, String value) throws IOException {
        List<String> lines = Files.readAllLines(dataFile, StandardCharsets.UTF_8);
        boolean found = false;
        List<String> out = new ArrayList<>(lines.size());
        for (String line : lines) {
            int sep = line.indexOf('|');
            if (!found && sep > 0 && line.substring(0, sep).equals(key)) {
                out.add(key + "|" + value);
                found = true;
            } else {
                out.add(line);
            }
        }
        if (found) {
            writeAllLines(out);
        }
        return found;
    }

    /**
     * text 引擎插入：在文件末尾追加一行。
     */
    void textInsert(String key, String value) throws IOException {
        Files.writeString(dataFile, key + "|" + value + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    /**
     * text 引擎删除：读全文件，移除命中行，整个文件写回。
     *
     * @return 是否命中并删除
     */
    boolean textDelete(String key) throws IOException {
        List<String> lines = Files.readAllLines(dataFile, StandardCharsets.UTF_8);
        boolean found = false;
        List<String> out = new ArrayList<>(lines.size());
        for (String line : lines) {
            int sep = line.indexOf('|');
            if (!found && sep > 0 && line.substring(0, sep).equals(key)) {
                found = true;
            } else {
                out.add(line);
            }
        }
        if (found) {
            writeAllLines(out);
        }
        return found;
    }

    /** 把行集合整体写回数据文件。 */
    private void writeAllLines(List<String> lines) throws IOException {
        StringBuilder sb = new StringBuilder(lines.size() * 44);
        for (String line : lines) {
            sb.append(line).append('\n');
        }
        Files.writeString(dataFile, sb.toString(), StandardCharsets.UTF_8);
    }

    // ============= seed 数据生成（确定性） =============

    /**
     * 生成第 i 条记录的 key：k + 7 位序号（如 k0000042）。
     *
     * @param i 序号
     * @return key 字符串
     */
    static String keyOf(int i) {
        return String.format("k%07d", i);
    }

    /**
     * 确定性生成第 i 条记录的 value：模拟订单串（约 33 字节），同 i 结果恒定。
     *
     * @param i 序号
     * @return value 字符串
     */
    static String valueOf(int i) {
        long h = (i * 2654435761L) & 0xFFFFFFFFL;
        return String.format("user-%04d|item-%05d|amt-%03d|paid",
                (h >>> 18) % 10000, (h >>> 7) % 100000, h % 1000);
    }

    // ============= 内部辅助 =============

    /** [0, bound) 均匀随机整数 */
    static int randomIndex(int bound) {
        return ThreadLocalRandom.current().nextInt(bound);
    }

    private static long elapsedMs(long startNs) {
        return (System.nanoTime() - startNs) / 1_000_000;
    }

    /** 数据文件路径（包级可见，供单元测试读取）。 */
    Path dataFilePath() {
        return dataFile;
    }

    private long fileSize() {
        try {
            return Files.size(dataFile);
        } catch (IOException e) {
            return 0;
        }
    }

    /** 汇总基准结果：总耗时、单次均值（微秒）、QPS。 */
    static RunResult buildResult(String engine, String op, int count, int ops,
                                 int ok, long resetMs, long totalNs, Long dataSizeBytes) {
        double avgUs = ops == 0 ? 0 : totalNs / 1000.0 / ops;
        double qps = totalNs == 0 ? 0 : ops * 1_000_000_000.0 / totalNs;
        return new RunResult(engine, op, count, ops, ok, resetMs,
                totalNs / 1_000_000, Math.round(avgUs * 100.0) / 100.0,
                Math.round(qps * 10.0) / 10.0, dataSizeBytes);
    }

    // ============= DTO =============

    /**
     * 一轮基准测试结果。
     *
     * @param engine        引擎名：text / mysql / caffeine
     * @param op            操作类型：get / update / insert / delete
     * @param count         数据行数
     * @param ops           操作次数
     * @param okCount       成功次数（随机 key 可能未命中/已删，允许小于 ops）
     * @param resetMs       准备数据耗时（重建数据，不计入基准）
     * @param totalMs       基准总耗时（毫秒）
     * @param avgUs         单次操作均值（微秒）
     * @param qps           每秒操作次数
     * @param dataSizeBytes 数据体积（字节数，text 引擎为文件大小，其余引擎为 null）
     */
    public record RunResult(
            String engine,
            String op,
            int count,
            int ops,
            int okCount,
            long resetMs,
            long totalMs,
            double avgUs,
            double qps,
            Long dataSizeBytes
    ) {
    }
}
