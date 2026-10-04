package run.runnable.numfeelservice.service;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.AppendResponse;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.LookupResponse;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.StatusResponse;
import run.runnable.numfeelservice.web.ApiException;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * UUID 碰撞实验：用 MySQL 真实主键查重，后台任务把表补齐到 1 亿条。
 * <p>
 * 没有独立状态表。表本身的状态就是权威状态：少于目标继续插入，超过目标停止，
 * 超过裁剪阈值则删除多余行。后台任务和现场追加互斥，避免同一瞬间互相干扰。
 */
@Service
public class UuidCollisionService {

    private static final Logger log = LoggerFactory.getLogger(UuidCollisionService.class);

    /** 基础实验目标行数。 */
    public static final long TARGET_ROW_COUNT = 100_000_000L;
    /** 真实行数超过目标这么多时才清理，避免把用户刚追加的少量数据删掉。 */
    public static final long TRIM_THRESHOLD = 1_000_000L;
    /** 一条批量 SQL 里的最大 VALUES 数。 */
    private static final int INSERT_BATCH_SIZE = 5_000;
    /** 每次定时检查最多插入的批数；4 批并发，每批 5000 条。 */
    private static final int SEED_BATCHES_PER_TICK = 4;
    /** 清理时的单次 DELETE 行数。 */
    private static final long DELETE_BATCH_SIZE = 50_000;
    /** 真实 COUNT(*) 的刷新周期；中间变化由插入/删除结果增量维护。 */
    private static final long ROW_COUNT_REFRESH_MS = 60_000L;

    private final DatabaseClient db;
    /** 4 个生成批次并发执行；SQL 执行仍是 R2DBC 响应式 I/O。 */
    private final ExecutorService uuidExecutor = Executors.newFixedThreadPool(4);
    /** 后台任务和现场追加互斥。 */
    private final AtomicBoolean writeBusy = new AtomicBoolean(false);
    /** 启动时查询、每分钟刷新的行数快照；-1 表示尚未初始化。 */
    private final AtomicLong cachedRowCount = new AtomicLong(-1L);
    private final AtomicLong cachedRowCountAtMs = new AtomicLong(0L);
    /** 每次增量更新都会变化，避免仍在途的旧 COUNT 查询覆盖新快照。 */
    private final AtomicLong rowCountVersion = new AtomicLong(0L);
    /** 服务进程启动后观察到的主键冲突数量；重启后重新累计。 */
    private final AtomicLong observedConflictCount = new AtomicLong(0L);

    public UuidCollisionService(DatabaseClient db) {
        this.db = db;
    }

    /**
     * 应用启动后先幂等建表，避免依赖其他初始化器的完成顺序。
     */
    @jakarta.annotation.PostConstruct
    public void ensureSchema() {
        db.sql("""
                        CREATE TABLE IF NOT EXISTS uuid_collision_seen (
                            id BINARY(16) NOT NULL PRIMARY KEY COMMENT 'UUIDv4 的 16 字节二进制'
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                        """)
                .then()
                .then(databaseRowCount(true))
                .doOnSuccess(count -> log.info("UUID collision table ready, initial rows: {}", count))
                .doOnError(err -> log.warn("UUID collision schema init failed: {}", err.getMessage()))
                .onErrorComplete()
                .subscribe();
    }

    /**
     * 每分钟刷新一次真实 COUNT(*)，避免 status 接口反复扫描 1 亿行表。
     */
    @Scheduled(initialDelay = 1_000L, fixedDelay = ROW_COUNT_REFRESH_MS)
    public void refreshRowCount() {
        databaseRowCount(true)
                .subscribe(
                        count -> log.debug("UUID collision row count refreshed: {}", count),
                        err -> log.warn("UUID collision row count refresh failed: {}", err.getMessage())
                );
    }

    /**
     * 服务关闭时停止接收新的生成任务并等待当前批次结束。
     */
    @PreDestroy
    public void shutdown() {
        uuidExecutor.shutdown();
        try {
            if (!uuidExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                uuidExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            uuidExecutor.shutdownNow();
        }
    }

    /**
     * 定时检查真实行数：低于目标继续补齐；超过裁剪阈值则删回目标值。
     */
    @Scheduled(initialDelay = 5_000L, fixedDelay = 10_000L)
    public void checkAndSeedOrTrim() {
        if (!writeBusy.compareAndSet(false, true)) {
            return;
        }
        checkOnce()
                .doFinally(signal -> writeBusy.set(false))
                .subscribe(
                        ignored -> { },
                        err -> log.warn("UUID collision background check failed: {}", err.getMessage())
                );
    }

    /**
     * 执行一次后台检查。
     *
     * @return 完成信号
     */
    private Mono<Void> checkOnce() {
        return databaseRowCount(false)
                .flatMap(count -> {
                    if (count > TARGET_ROW_COUNT + TRIM_THRESHOLD) {
                        return trimToTarget(count);
                    }
                    if (count >= TARGET_ROW_COUNT) {
                        return Mono.empty();
                    }
                    return seedOnce(count);
                });
    }

    /**
     * 执行一轮补齐；4 个批次并发，每批 5000 条。
     *
     * @param currentCount 本轮开始时的真实行数
     * @return 完成信号
     */
    private Mono<Void> seedOnce(long currentCount) {
        long remaining = TARGET_ROW_COUNT - currentCount;
        int batches = (int) Math.min(
                SEED_BATCHES_PER_TICK,
                (remaining + INSERT_BATCH_SIZE - 1L) / INSERT_BATCH_SIZE);
        List<Integer> batchSizes = new ArrayList<>(batches);
        long allocated = 0L;
        for (int i = 0; i < batches; i++) {
            long size = Math.min(INSERT_BATCH_SIZE, remaining - allocated);
            batchSizes.add((int) Math.max(0L, size));
            allocated += size;
        }
        return Flux.fromIterable(batchSizes)
                .flatMap(size -> generateBatch(size)
                        .flatMap(this::insertBatch), 4)
                .then();
    }

    /**
     * 删除多余行，精确裁剪到目标行数。
     *
     * @param currentCount 裁剪前的真实行数
     * @return 完成信号
     */
    private Mono<Void> trimToTarget(long currentCount) {
        AtomicLong remaining = new AtomicLong(currentCount - TARGET_ROW_COUNT);
        return Flux.defer(() -> {
                    if (remaining.get() <= 0) {
                        return Mono.just(0L);
                    }
                    long limit = Math.min(DELETE_BATCH_SIZE, remaining.get());
                    return db.sql("DELETE FROM uuid_collision_seen LIMIT " + limit)
                            .fetch()
                            .rowsUpdated()
                            .doOnNext(deleted -> {
                                if (deleted <= 0) {
                                    // 防御：即使数据库行为异常或并发清理，也不能进入空转循环。
                                    remaining.set(0L);
                                } else {
                                    remaining.addAndGet(-deleted);
                                    updateCachedRowCount(-deleted);
                                }
                            });
                })
                .repeat(() -> remaining.get() > 0)
                .reduce(0L, Long::sum)
                .then();
    }

    /**
     * 用主键索引查询单个 UUID 是否已出现在表中。
     *
     * @param requestedUuid 用户输入的 UUIDv4
     * @return 查询结果
     */
    public Mono<LookupResponse> lookup(String requestedUuid) {
        UUID uuid = parseUuidV4(requestedUuid);
        byte[] id = toBinary(uuid);
        long start = System.nanoTime();
        return db.sql("""
                        SELECT EXISTS(
                            SELECT 1
                            FROM uuid_collision_seen
                            WHERE id = ?
                        ) AS exists_flag
                        """)
                .bind(0, id)
                .map(row -> Boolean.TRUE.equals(row.get("exists_flag")))
                .one()
                .defaultIfEmpty(false)
                .map(exists -> new LookupResponse(
                        uuid.toString(),
                        exists,
                        cachedRowCount.get(),
                        "PRIMARY KEY (BINARY(16))",
                        elapsedMs(start)));
    }

    /**
     * 查询实验状态。行数来自启动/每分钟刷新的 COUNT 快照，
     * 写入和删除会增量修正快照，避免每次请求都扫描 1 亿行表。
     *
     * @return 状态响应
     */
    public Mono<StatusResponse> status() {
        return databaseRowCount(false)
                .map(count -> new StatusResponse(
                        count,
                        TARGET_ROW_COUNT,
                        TARGET_ROW_COUNT + TRIM_THRESHOLD,
                        Math.min(100D, count * 100D / TARGET_ROW_COUNT),
                        observedConflictCount.get(),
                        writeBusy.get()));
    }

    /**
     * 现场追加一批随机 UUIDv4。
     *
     * @param requestedCount 生成数量，只允许 1000 / 10000 / 100000
     * @return 追加结果
     */
    public Mono<AppendResponse> append(int requestedCount) {
        if (requestedCount != 1_000 && requestedCount != 10_000 && requestedCount != 100_000) {
            throw ApiException.badRequest("count must be 1000, 10000, or 100000");
        }
        if (!writeBusy.compareAndSet(false, true)) {
            throw new ApiException(503, "UUID experiment is busy, please retry later");
        }
        long start = System.nanoTime();
        return databaseRowCount(false)
                .flatMap(before -> insertExactly(requestedCount)
                        .flatMap(result -> databaseRowCount(false)
                                .map(after -> new AppendResponse(
                                        requestedCount,
                                        result.insertedCount(),
                                        result.duplicateCount(),
                                        before,
                                        after,
                                        elapsedMs(start)))))
                .doFinally(signal -> writeBusy.set(false));
    }

    /**
     * 把指定数量的 UUID 拆成 5000 条一批插入。
     *
     * @param requestedCount 要生成的 UUID 总数
     * @return 总插入结果
     */
    private Mono<BatchResult> insertExactly(int requestedCount) {
        int fullBatches = requestedCount / INSERT_BATCH_SIZE;
        int remainder = requestedCount % INSERT_BATCH_SIZE;
        return Flux.range(0, fullBatches + (remainder == 0 ? 0 : 1))
                .concatMap(batch -> {
                    int size = batch == fullBatches && remainder > 0 ? remainder : INSERT_BATCH_SIZE;
                    return generateBatch(size).flatMap(this::insertBatch);
                })
                .reduce(new BatchResult(0L, 0L), (sum, item) -> new BatchResult(
                        sum.insertedCount() + item.insertedCount(),
                        sum.duplicateCount() + item.duplicateCount()));
    }

    /**
     * 生成一批 UUIDv4。
     *
     * @return 16 字节 UUID 列表
     */
    private Mono<List<byte[]>> generateBatch(int size) {
        return Mono.fromCallable(() -> {
            List<byte[]> values = new ArrayList<>(size);
            for (int i = 0; i < size; i++) {
                values.add(toBinary(UUID.randomUUID()));
            }
            return values;
        }).subscribeOn(Schedulers.fromExecutor(uuidExecutor));
    }

    /**
     * 执行多行 INSERT IGNORE 并计算重复数。
     *
     * @param values 待插入 UUID 列表
     * @return 插入结果
     */
    private Mono<BatchResult> insertBatch(List<byte[]> values) {
        if (values.isEmpty()) {
            return Mono.just(new BatchResult(0L, 0L));
        }
        StringBuilder placeholders = new StringBuilder(values.size() * 4);
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                placeholders.append(',');
            }
            placeholders.append("(?)");
        }
        DatabaseClient.GenericExecuteSpec spec = db.sql(
                "INSERT IGNORE INTO uuid_collision_seen (id) VALUES " + placeholders);
        for (int i = 0; i < values.size(); i++) {
            spec = spec.bind(i, values.get(i));
        }
        return spec.fetch()
                .rowsUpdated()
                .map(inserted -> {
                    long duplicates = values.size() - inserted;
                    if (duplicates > 0) {
                        observedConflictCount.addAndGet(duplicates);
                    }
                    updateCachedRowCount(inserted);
                    return new BatchResult(inserted, duplicates);
                });
    }

    /**
     * 读取行数。force 为 true 时查询数据库；false 时优先读 60 秒快照。
     * 启动时首次查询，定时任务每分钟刷新；写入和删除会更新快照。
     *
     * @param force 是否强制查询数据库
     * @return 行数
     */
    private Mono<Long> databaseRowCount(boolean force) {
        if (!force) {
            long cached = cachedRowCount.get();
            long cachedAt = cachedRowCountAtMs.get();
            if (cached >= 0
                    && cachedAt > 0
                    && System.currentTimeMillis() - cachedAt <= ROW_COUNT_REFRESH_MS) {
                return Mono.just(cached);
            }
        }
        long version = rowCountVersion.get();
        return db.sql("SELECT COUNT(*) AS row_count FROM uuid_collision_seen")
                .map(row -> ((Number) row.get("row_count")).longValue())
                .one()
                .doOnNext(count -> {
                    // 查询期间若有写入/删除，增量版本已变化；这次旧快照不覆盖新值。
                    if (version == rowCountVersion.get()) {
                        cachedRowCount.set(count);
                        cachedRowCountAtMs.set(System.currentTimeMillis());
                    }
                });
    }

    /**
     * 用一批 SQL 的实际影响行数修正内存行数快照。
     *
     * @param delta 新增或删除的行数；删除传负数
     */
    private void updateCachedRowCount(long delta) {
        if (cachedRowCount.get() >= 0) {
            cachedRowCount.addAndGet(delta);
            cachedRowCountAtMs.set(System.currentTimeMillis());
        }
        rowCountVersion.incrementAndGet();
    }

    /**
     * 把 Java UUID 转成 16 字节大端二进制。
     *
     * @param uuid UUIDv4
     * @return 16 字节数组
     */
    private byte[] toBinary(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }

    /**
     * 解析并验证用户输入的 UUIDv4。
     *
     * @param value 用户输入
     * @return 规范化 UUID
     */
    private UUID parseUuidV4(String value) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("uuid is required");
        }
        String normalized = value.trim().toLowerCase();
        if (normalized.matches("[0-9a-f]{32}")) {
            normalized = normalized.replaceFirst(
                    "([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})",
                    "$1-$2-$3-$4-$5");
        }
        try {
            UUID uuid = UUID.fromString(normalized);
            if (uuid.version() != 4) {
                throw ApiException.badRequest("only UUIDv4 can be checked");
            }
            return uuid;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid UUIDv4");
        }
    }

    /**
     * 计算经过的毫秒数。
     *
     * @param startNano 起始 System.nanoTime()
     * @return 毫秒
     */
    private long elapsedMs(long startNano) {
        return Math.max(0L, (System.nanoTime() - startNano) / 1_000_000L);
    }

    /** 一批或多批插入的累计结果。 */
    private record BatchResult(long insertedCount, long duplicateCount) {
    }
}
