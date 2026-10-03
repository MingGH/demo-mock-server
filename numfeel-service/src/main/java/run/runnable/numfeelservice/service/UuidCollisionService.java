package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
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
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.StatusResponse;
import run.runnable.numfeelservice.web.ApiException;

import java.nio.ByteBuffer;
import java.time.Duration;
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

    private final DatabaseClient db;
    /** 4 个生成批次并发执行；SQL 执行仍是 R2DBC 响应式 I/O。 */
    private final ExecutorService uuidExecutor = Executors.newFixedThreadPool(4);
    /** 后台任务和现场追加互斥。 */
    private final AtomicBoolean writeBusy = new AtomicBoolean(false);
    /** 短缓存：100M 行 COUNT(*) 有成本，避免前端连点直接打穿数据库。 */
    private final Cache<String, Long> rowCountCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(2))
            .build();

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
                .doOnSuccess(ignored -> log.info("UUID collision table ready"))
                .doOnError(err -> log.warn("UUID collision schema init failed: {}", err.getMessage()))
                .onErrorComplete()
                .subscribe();
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
        return databaseRowCount(true)
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
                            .doOnNext(remaining::addAndGet);
                })
                .repeat(() -> remaining.get() > 0)
                .reduce(0L, Long::sum)
                .then()
                .doOnSuccess(ignored -> rowCountCache.invalidate("count"));
    }

    /**
     * 查询实验状态。行数来自 MySQL 实时 COUNT(*)，短缓存 2 秒。
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
                        .flatMap(result -> databaseRowCount(true)
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
                .map(inserted -> new BatchResult(inserted, values.size() - inserted))
                .doFinally(ignored -> rowCountCache.invalidate("count"));
    }

    /**
     * 读取真实行数。force 为 true 时绕过短缓存。
     *
     * @param force 是否强制查询数据库
     * @return 行数
     */
    private Mono<Long> databaseRowCount(boolean force) {
        if (!force) {
            Long cached = rowCountCache.getIfPresent("count");
            if (cached != null) {
                return Mono.just(cached);
            }
        }
        return db.sql("SELECT COUNT(*) AS row_count FROM uuid_collision_seen")
                .map(row -> ((Number) row.get("row_count")).longValue())
                .one()
                .doOnNext(count -> rowCountCache.put("count", count));
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
