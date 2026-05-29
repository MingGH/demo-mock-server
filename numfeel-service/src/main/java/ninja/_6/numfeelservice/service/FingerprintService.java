package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 浏览器指纹业务逻辑层（R2DBC 重写）。
 * <p>
 * 保留旧版的内存兜底计数：当 MySQL 不可用时，{@code collect} 返回内存计数结果。
 */
@Service
public class FingerprintService {

    private static final Logger log = LoggerFactory.getLogger(FingerprintService.class);

    private static final String SQL_INSERT = """
        INSERT INTO browser_fingerprints
          (full_hash, canvas_hash, font_hash, webgl_hash, screen_info, timezone,
           language, platform, hardware_concurrency, device_memory, touch_support,
           color_depth, pixel_ratio, entropy_bits, ip_hint, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_TOTAL = "SELECT COUNT(*) AS total FROM browser_fingerprints";

    private static final String SQL_LAST_VISITS =
            "SELECT created_at FROM browser_fingerprints WHERE full_hash = ? ORDER BY created_at DESC LIMIT 2";

    private static final String SQL_VISIT_COUNT =
            "SELECT COUNT(*) AS cnt FROM browser_fingerprints WHERE full_hash = ?";

    private static final String SQL_STATS = """
        SELECT
          COUNT(*) AS total,
          COUNT(DISTINCT full_hash) AS unique_full,
          COUNT(DISTINCT canvas_hash) AS unique_canvas,
          COUNT(DISTINCT font_hash) AS unique_font,
          COUNT(DISTINCT webgl_hash) AS unique_webgl,
          COUNT(DISTINCT timezone) AS unique_tz,
          COUNT(DISTINCT screen_info) AS unique_screen,
          COUNT(DISTINCT platform) AS unique_platform,
          AVG(entropy_bits) AS avg_entropy
        FROM browser_fingerprints
        """;

    private final DatabaseClient db;
    private final AtomicLong memTotal = new AtomicLong(0);

    public FingerprintService(DatabaseClient db) {
        this.db = db;
    }

    /** 保存一条指纹记录，返回 { total, sameHashCount, lastSeenAt, source }。 */
    public Mono<ObjectNode> collect(FingerprintRecord r) {
        long now = Instant.now().toEpochMilli();

        DatabaseClient.GenericExecuteSpec spec = db.sql(SQL_INSERT)
                .bind(0, r.fullHash());
        spec = bindNullable(spec, 1, r.canvasHash(), String.class);
        spec = bindNullable(spec, 2, r.fontHash(), String.class);
        spec = bindNullable(spec, 3, r.webglHash(), String.class);
        spec = bindNullable(spec, 4, r.screenInfo(), String.class);
        spec = bindNullable(spec, 5, r.timezone(), String.class);
        spec = bindNullable(spec, 6, r.language(), String.class);
        spec = bindNullable(spec, 7, r.platform(), String.class);
        spec = bindNullable(spec, 8, r.hardwareConcurrency(), Integer.class);
        spec = bindNullable(spec, 9, r.deviceMemory(), Integer.class);
        spec = spec.bind(10, r.touchSupport() ? 1 : 0);
        spec = bindNullable(spec, 11, r.colorDepth(), Integer.class);
        spec = bindNullable(spec, 12, r.pixelRatio(), Double.class);
        spec = bindNullable(spec, 13, r.entropyBits(), Double.class);
        spec = bindNullable(spec, 14, r.ipHint(), String.class);
        spec = spec.bind(15, now);

        return spec.fetch().rowsUpdated()
                .then(db.sql(SQL_TOTAL).map((row, meta) -> nz(row.get("total", Long.class))).one())
                .flatMap(total -> db.sql(SQL_LAST_VISITS).bind(0, r.fullHash())
                        .map((row, meta) -> row.get("created_at", Long.class))
                        .all().collectList()
                        .flatMap(timestamps -> {
                            Long lastSeenAt = timestamps.size() >= 2 ? timestamps.get(1) : null;
                            return db.sql(SQL_VISIT_COUNT).bind(0, r.fullHash())
                                    .map((row, meta) -> nz(row.get("cnt", Long.class))).one()
                                    .map(visitCount -> {
                                        ObjectNode obj = Json.obj();
                                        obj.put("total", total);
                                        obj.put("sameHashCount", visitCount);
                                        if (lastSeenAt != null) {
                                            obj.put("lastSeenAt", lastSeenAt);
                                        } else {
                                            obj.putNull("lastSeenAt");
                                        }
                                        obj.put("source", "mysql");
                                        return obj;
                                    });
                        }))
                .onErrorResume(err -> {
                    log.error("Fingerprint collect failed: {}", err.getMessage());
                    long total = memTotal.incrementAndGet();
                    ObjectNode obj = Json.obj();
                    obj.put("total", total);
                    obj.put("source", "memory");
                    return Mono.just(obj);
                });
    }

    /** 查询全站统计数据。 */
    public Mono<ObjectNode> stats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            long total = nz(row.get("total", Long.class));
            long uniqueFull = nz(row.get("unique_full", Long.class));
            double avgVisits = uniqueFull > 0 ? Math.round(total * 100.0 / uniqueFull) / 100.0 : 0;
            Double avgEntropy = row.get("avg_entropy", Double.class);

            ObjectNode obj = Json.obj();
            obj.put("total", total);
            obj.put("uniqueFull", uniqueFull);
            obj.put("avgVisits", avgVisits);
            obj.put("uniqueCanvas", nz(row.get("unique_canvas", Long.class)));
            obj.put("uniqueFont", nz(row.get("unique_font", Long.class)));
            obj.put("uniqueWebgl", nz(row.get("unique_webgl", Long.class)));
            obj.put("uniqueTimezone", nz(row.get("unique_tz", Long.class)));
            obj.put("uniqueScreen", nz(row.get("unique_screen", Long.class)));
            obj.put("uniquePlatform", nz(row.get("unique_platform", Long.class)));
            obj.put("avgEntropy", avgEntropy != null ? Math.round(avgEntropy * 100.0) / 100.0 : 0);
            return obj;
        }).one();
    }

    private static <T> DatabaseClient.GenericExecuteSpec bindNullable(
            DatabaseClient.GenericExecuteSpec spec, int index, T value, Class<T> type) {
        return value == null ? spec.bindNull(index, type) : spec.bind(index, value);
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
