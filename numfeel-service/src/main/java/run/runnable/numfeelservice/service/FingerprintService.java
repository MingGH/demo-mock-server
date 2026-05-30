package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintCollectResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintStatsResponse;
import run.runnable.numfeelservice.model.FingerprintRecord;
import run.runnable.numfeelservice.model.TrackingEntities.BrowserFingerprint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicLong;

/**
 * 浏览器指纹采集与统计（基于 DatabaseClient + SQL，内存兜底）。
 */
@Service
public class FingerprintService {

    private static final Logger log = LoggerFactory.getLogger(FingerprintService.class);

    private final R2dbcEntityTemplate template;
    private final AtomicLong memTotal = new AtomicLong(0);

    public FingerprintService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 采集一条指纹记录并返回即时统计。
     * <p>
     * 先 INSERT 到 {@code browser_fingerprints} 表，再通过 SQL 子查询
     * 获取总量、同指纹历史数量及上一次出现的时间戳。
     * 若 MySQL 不可用则落入内存计数兜底。
     *
     * @param r 前端上报的指纹记录
     * @return 包含 {@code total}、{@code sameHashCount}、
     *         {@code lastSeenAt} 和 {@code source} 的响应 Mono
     */
    public Mono<BrowserFingerprintCollectResponse> collect(FingerprintRecord r) {
        BrowserFingerprint entity = new BrowserFingerprint(
                null,
                r.fullHash(),
                r.canvasHash(),
                r.fontHash(),
                r.webglHash(),
                r.screenInfo(),
                r.timezone(),
                r.language(),
                r.platform(),
                r.hardwareConcurrency(),
                r.deviceMemory(),
                r.touchSupport(),
                r.colorDepth(),
                r.pixelRatio(),
                r.entropyBits(),
                r.ipHint(),
                System.currentTimeMillis()
        );

        DatabaseClient client = template.getDatabaseClient();
        return template.insert(BrowserFingerprint.class)
                .using(entity)
                .then(client.sql("""
                        SELECT
                          (SELECT COUNT(*) FROM browser_fingerprints) AS total,
                          (SELECT COUNT(*) FROM browser_fingerprints
                           WHERE full_hash = :full_hash) AS same_hash_count,
                          (SELECT created_at FROM browser_fingerprints
                           WHERE full_hash = :full_hash
                           ORDER BY created_at DESC
                           LIMIT 1 OFFSET 1) AS last_seen_at
                        """)
                        .bind("full_hash", r.fullHash())
                        .map((row, meta) -> {
                            long total = number(row.get("total")).longValue();
                            long sameHashCount = number(row.get("same_hash_count")).longValue();
                            Object lastSeenObj = row.get("last_seen_at");
                            Long lastSeenAt = lastSeenObj instanceof Number n ? n.longValue() : null;
                            return new BrowserFingerprintCollectResponse(
                                    total, sameHashCount, lastSeenAt, "mysql");
                        })
                        .one())
                .onErrorResume(err -> {
                    log.error("Fingerprint collect failed: {}", err.getMessage());
                    long total = memTotal.incrementAndGet();
                    return Mono.just(new BrowserFingerprintCollectResponse(
                            total, null, null, "memory"));
                });
    }

    /**
     * 查询全站浏览器指纹统计数据。
     * <p>
     * 一条 SQL 完成总量、各维度去重计数和平均熵值计算，
     * 平均访问次数由 {@code total / unique_full} 在应用层得出。
     *
     * @return 包含各维度统计值的响应 Mono
     */
    public Mono<BrowserFingerprintStatsResponse> stats() {
        DatabaseClient client = template.getDatabaseClient();
        return client.sql("""
                        SELECT
                          COUNT(*) AS total,
                          COUNT(DISTINCT full_hash) AS unique_full,
                          COUNT(DISTINCT canvas_hash) AS unique_canvas,
                          COUNT(DISTINCT font_hash) AS unique_font,
                          COUNT(DISTINCT webgl_hash) AS unique_webgl,
                          COUNT(DISTINCT timezone) AS unique_timezone,
                          COUNT(DISTINCT screen_info) AS unique_screen,
                          COUNT(DISTINCT platform) AS unique_platform,
                          COALESCE(AVG(entropy_bits), 0) AS avg_entropy
                        FROM browser_fingerprints
                        """)
                .map((row, meta) -> {
                    long total = number(row.get("total")).longValue();
                    long uniqueFull = number(row.get("unique_full")).longValue();
                    double avgEntropy = number(row.get("avg_entropy")).doubleValue();
                    double avgVisits = uniqueFull > 0
                            ? ServiceSupport.round((double) total / uniqueFull, 2)
                            : 0;
                    return new BrowserFingerprintStatsResponse(
                            total,
                            uniqueFull,
                            avgVisits,
                            number(row.get("unique_canvas")).longValue(),
                            number(row.get("unique_font")).longValue(),
                            number(row.get("unique_webgl")).longValue(),
                            number(row.get("unique_timezone")).longValue(),
                            number(row.get("unique_screen")).longValue(),
                            number(row.get("unique_platform")).longValue(),
                            ServiceSupport.round(avgEntropy, 2)
                    );
                })
                .one()
                .defaultIfEmpty(new BrowserFingerprintStatsResponse(
                        0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
    }

    /**
     * 将可能为 {@code null} 或非数值类型的列值安全转为 {@link Number}。
     *
     * @param value 行数据中取出的列值
     * @return 值本身（如果是 Number 实例），否则返回 0
     */
    private Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
