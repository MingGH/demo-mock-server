package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintCollectResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintStatsResponse;
import run.runnable.numfeelservice.model.FingerprintRecord;
import run.runnable.numfeelservice.model.TrackingEntities.BrowserFingerprint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Comparator;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 浏览器指纹业务逻辑层（R2DBC 重写）。
 * <p>
 * 保留旧版的内存兜底计数：当 MySQL 不可用时，{@code collect} 返回内存计数结果。
 */
@Service
public class FingerprintService {

    private static final Logger log = LoggerFactory.getLogger(FingerprintService.class);

    private final R2dbcEntityTemplate template;
    private final AtomicLong memTotal = new AtomicLong(0);

    public FingerprintService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /** 保存一条指纹记录，返回总量、同指纹数量、上次出现时间与数据源。 */
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

        return template.insert(BrowserFingerprint.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, BrowserFingerprint.class))
                .map(rows -> toCollectResponse(rows, r.fullHash()))
                .onErrorResume(err -> {
                    log.error("Fingerprint collect failed: {}", err.getMessage());
                    long total = memTotal.incrementAndGet();
                    return Mono.just(new BrowserFingerprintCollectResponse(total, null, null, "memory"));
                });
    }

    /** 查询全站统计数据。 */
    public Mono<BrowserFingerprintStatsResponse> stats() {
        return ServiceSupport.selectAll(template, BrowserFingerprint.class)
                .map(this::toStatsResponse);
    }

    /** 根据当前总指纹的历史记录生成“认出你了”提示所需数据。 */
    private BrowserFingerprintCollectResponse toCollectResponse(java.util.List<BrowserFingerprint> rows, String fullHash) {
        long total = rows.size();
        java.util.List<BrowserFingerprint> sameHashRows = rows.stream()
                .filter(row -> fullHash.equals(row.fullHash()))
                .sorted(Comparator.comparingLong(BrowserFingerprint::createdAt).reversed())
                .toList();
        Long lastSeenAt = sameHashRows.size() >= 2 ? sameHashRows.get(1).createdAt() : null;
        return new BrowserFingerprintCollectResponse(total, (long) sameHashRows.size(), lastSeenAt, "mysql");
    }

    /** 聚合浏览器指纹维度统计，供全站统计面板展示。 */
    private BrowserFingerprintStatsResponse toStatsResponse(java.util.List<BrowserFingerprint> rows) {
        long total = rows.size();
        long uniqueFull = ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::fullHash);
        double avgVisits = uniqueFull > 0 ? ServiceSupport.round(total / (double) uniqueFull, 2) : 0;
        double avgEntropy = rows.stream()
                .map(BrowserFingerprint::entropyBits)
                .filter(java.util.Objects::nonNull)
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0);

        return new BrowserFingerprintStatsResponse(
                total,
                uniqueFull,
                avgVisits,
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::canvasHash),
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::fontHash),
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::webglHash),
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::timezone),
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::screenInfo),
                ServiceSupport.distinctNonNullCount(rows, BrowserFingerprint::platform),
                ServiceSupport.round(avgEntropy, 2)
        );
    }
}
