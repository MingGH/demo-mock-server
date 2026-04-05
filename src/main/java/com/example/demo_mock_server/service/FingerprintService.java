package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 浏览器指纹业务逻辑层
 */
public class FingerprintService {

    private static final Logger log = LoggerFactory.getLogger(FingerprintService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS browser_fingerprints (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            full_hash VARCHAR(64) NOT NULL,
            canvas_hash VARCHAR(64),
            font_hash VARCHAR(64),
            webgl_hash VARCHAR(64),
            screen_info VARCHAR(128),
            timezone VARCHAR(64),
            language VARCHAR(32),
            platform VARCHAR(64),
            hardware_concurrency TINYINT,
            device_memory TINYINT,
            touch_support TINYINT(1),
            color_depth TINYINT,
            pixel_ratio FLOAT,
            entropy_bits FLOAT,
            ip_hint VARCHAR(64),
            created_at BIGINT NOT NULL,
            INDEX idx_full_hash (full_hash),
            INDEX idx_canvas_hash (canvas_hash),
            INDEX idx_font_hash (font_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

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

    private final MySQLPool pool;
    // 内存兜底计数（MySQL 不可用时）
    private final AtomicLong memTotal = new AtomicLong(0);

    public FingerprintService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) {
                log.error("Table init failed: {}", ar.cause().getMessage());
            } else {
                log.info("browser_fingerprints table ready");
            }
        });
    }

    /**
     * 保存一条指纹记录，返回 { total, sameHashCount, lastSeenAt }
     */
    public Future<JsonObject> collect(FingerprintRecord record) {
        return pool.preparedQuery(SQL_INSERT)
            .execute(buildInsertTuple(record))
            .compose(ignored -> pool.query(SQL_TOTAL).execute())
            .compose(totalResult -> {
                long total = totalResult.iterator().next().getLong("total");
                return pool.preparedQuery(SQL_LAST_VISITS)
                    .execute(Tuple.of(record.fullHash()))
                    .compose(lastRows -> {
                        Long lastSeenAt = null;
                        if (lastRows.size() >= 2) {
                            var iter = lastRows.iterator();
                            iter.next(); // 跳过本次
                            lastSeenAt = iter.next().getLong("created_at");
                        }
                        final Long lastSeenAtFinal = lastSeenAt;
                        return pool.preparedQuery(SQL_VISIT_COUNT)
                            .execute(Tuple.of(record.fullHash()))
                            .map(cntResult -> {
                                long visitCount = cntResult.iterator().next().getLong("cnt");
                                return new JsonObject()
                                    .put("total", total)
                                    .put("sameHashCount", visitCount)
                                    .put("lastSeenAt", lastSeenAtFinal)
                                    .put("source", "mysql");
                            });
                    });
            })
            .recover(err -> {
                log.error("Fingerprint collect failed: {}", err.getMessage());
                long total = memTotal.incrementAndGet();
                return Future.succeededFuture(new JsonObject()
                    .put("total", total)
                    .put("source", "memory"));
            });
    }

    /**
     * 查询全站统计数据
     */
    public Future<JsonObject> stats() {
        return pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            long total = row.getLong("total");
            long uniqueFull = row.getLong("unique_full");
            double avgVisits = uniqueFull > 0
                ? Math.round(total * 100.0 / uniqueFull) / 100.0 : 0;

            return new JsonObject()
                .put("total", total)
                .put("uniqueFull", uniqueFull)
                .put("avgVisits", avgVisits)
                .put("uniqueCanvas", row.getLong("unique_canvas"))
                .put("uniqueFont", row.getLong("unique_font"))
                .put("uniqueWebgl", row.getLong("unique_webgl"))
                .put("uniqueTimezone", row.getLong("unique_tz"))
                .put("uniqueScreen", row.getLong("unique_screen"))
                .put("uniquePlatform", row.getLong("unique_platform"))
                .put("avgEntropy", row.getDouble("avg_entropy") != null
                    ? Math.round(row.getDouble("avg_entropy") * 100.0) / 100.0 : 0);
        });
    }

    private Tuple buildInsertTuple(FingerprintRecord r) {
        return Tuple.of(
            r.fullHash(), r.canvasHash(), r.fontHash(), r.webglHash(),
            r.screenInfo(), r.timezone(), r.language(), r.platform(),
            r.hardwareConcurrency(), r.deviceMemory(), r.touchSupport() ? 1 : 0,
            r.colorDepth(), r.pixelRatio(), r.entropyBits(), r.ipHint(),
            Instant.now().toEpochMilli()
        );
    }
}
