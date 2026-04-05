package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 浏览器指纹收集接口
 * POST /fingerprint/collect  — 保存一条指纹记录
 * GET  /fingerprint/stats    — 查询统计数据（总数、唯一数、维度分布）
 */
public class BrowserFingerprintHandler implements Handler<RoutingContext> {

    private final Vertx vertx;
    private final io.vertx.mysqlclient.MySQLPool pool;

    // 内存兜底计数（MySQL 不可用时）
    private final AtomicLong memTotal = new AtomicLong(0);
    private final AtomicLong memUnique = new AtomicLong(0);

    public BrowserFingerprintHandler(Vertx vertx, io.vertx.mysqlclient.MySQLPool pool) {
        this.vertx = vertx;
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        String ddl = """
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
        pool.query(ddl).execute(ar -> {
            if (ar.failed()) {
                System.err.println("[Fingerprint] Table init failed: " + ar.cause().getMessage());
            } else {
                System.out.println("[Fingerprint] Table ready");
            }
        });
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/collect")) {
            handleCollect(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    // ── POST /fingerprint/collect ──────────────────────────────────────────
    private void handleCollect(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) {
            sendError(ctx, 400, "Invalid JSON");
            return;
        }

        String fullHash = sanitize(body.getString("fullHash"), 64);
        if (fullHash == null || fullHash.isEmpty()) {
            sendError(ctx, 400, "fullHash required");
            return;
        }

        String canvasHash = sanitize(body.getString("canvasHash"), 64);
        String fontHash = sanitize(body.getString("fontHash"), 64);
        String webglHash = sanitize(body.getString("webglHash"), 64);
        String screenInfo = sanitize(body.getString("screenInfo"), 128);
        String timezone = sanitize(body.getString("timezone"), 64);
        String language = sanitize(body.getString("language"), 32);
        String platform = sanitize(body.getString("platform"), 64);
        Integer hwConcurrency = clampInt(body.getInteger("hardwareConcurrency"), 1, 256);
        Integer deviceMemory = clampInt(body.getInteger("deviceMemory"), 0, 128);
        Boolean touchSupport = body.getBoolean("touchSupport", false);
        Integer colorDepth = clampInt(body.getInteger("colorDepth"), 1, 64);
        Double pixelRatio = clampDouble(body.getDouble("pixelRatio"), 0.5, 10.0);
        Double entropyBits = clampDouble(body.getDouble("entropyBits"), 0.0, 64.0);
        String ipHint = sanitize(ctx.request().remoteAddress() != null
            ? ctx.request().remoteAddress().host() : null, 64);

        long now = Instant.now().toEpochMilli();

        pool.preparedQuery("""
            INSERT INTO browser_fingerprints
              (full_hash, canvas_hash, font_hash, webgl_hash, screen_info, timezone,
               language, platform, hardware_concurrency, device_memory, touch_support,
               color_depth, pixel_ratio, entropy_bits, ip_hint, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """)
            .execute(io.vertx.sqlclient.Tuple.of(
                fullHash, canvasHash, fontHash, webglHash, screenInfo, timezone,
                language, platform, hwConcurrency, deviceMemory, touchSupport ? 1 : 0,
                colorDepth, pixelRatio, entropyBits, ipHint, now
            ), ar -> {
                if (ar.failed()) {
                    System.err.println("[Fingerprint] Insert failed: " + ar.cause().getMessage());
                    // 内存兜底
                    long total = memTotal.incrementAndGet();
                    ctx.response()
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject()
                            .put("status", 200)
                            .put("data", new JsonObject()
                                .put("total", total)
                                .put("source", "memory"))
                            .encode());
                    return;
                }
                // 查询当前总数和该 hash 出现次数
                pool.preparedQuery("SELECT COUNT(*) AS total FROM browser_fingerprints")
                    .execute(countAr -> {
                        long total = countAr.succeeded()
                            ? countAr.result().iterator().next().getLong("total") : memTotal.incrementAndGet();

                        pool.preparedQuery(
                            "SELECT COUNT(*) AS same, MIN(created_at) AS first_seen FROM browser_fingerprints WHERE full_hash = ?")
                            .execute(io.vertx.sqlclient.Tuple.of(fullHash), sameAr -> {
                                long same = sameAr.succeeded()
                                    ? sameAr.result().iterator().next().getLong("same") : 1;
                                Long firstSeen = sameAr.succeeded()
                                    ? sameAr.result().iterator().next().getLong("first_seen") : null;

                                ctx.response()
                                    .putHeader("Content-Type", "application/json")
                                    .end(new JsonObject()
                                        .put("status", 200)
                                        .put("data", new JsonObject()
                                            .put("total", total)
                                            .put("sameHashCount", same)
                                            .put("firstSeenAt", firstSeen)
                                            .put("source", "mysql"))
                                        .encode());
                            });
                    });
            });
    }

    // ── GET /fingerprint/stats ─────────────────────────────────────────────
    private void handleStats(RoutingContext ctx) {
        pool.query("""
            SELECT
              COUNT(*) AS total,
              COUNT(DISTINCT full_hash) AS unique_full,
              SUM(CASE WHEN cnt = 1 THEN 1 ELSE 0 END) AS truly_unique,
              COUNT(DISTINCT canvas_hash) AS unique_canvas,
              COUNT(DISTINCT font_hash) AS unique_font,
              COUNT(DISTINCT webgl_hash) AS unique_webgl,
              COUNT(DISTINCT timezone) AS unique_tz,
              COUNT(DISTINCT screen_info) AS unique_screen,
              COUNT(DISTINCT platform) AS unique_platform,
              AVG(entropy_bits) AS avg_entropy
            FROM (
              SELECT full_hash, canvas_hash, font_hash, webgl_hash,
                     timezone, screen_info, platform, entropy_bits,
                     COUNT(*) OVER (PARTITION BY full_hash) AS cnt
              FROM browser_fingerprints
            ) t
            """)
            .execute(ar -> {
                if (ar.failed()) {
                    sendError(ctx, 500, "DB error");
                    return;
                }
                var row = ar.result().iterator().next();
                long total = row.getLong("total");
                long uniqueFull = row.getLong("unique_full");
                long trulyUnique = row.getLong("truly_unique");

                // 平均访问次数 = 总记录 / 不重复指纹数
                double avgVisits = uniqueFull > 0
                    ? Math.round(total * 100.0 / uniqueFull) / 100.0
                    : 0;

                JsonObject data = new JsonObject()
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

                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(new JsonObject().put("status", 200).put("data", data).encode());
            });
    }

    // ── 工具方法 ───────────────────────────────────────────────────────────
    private String sanitize(String val, int maxLen) {
        if (val == null) return null;
        val = val.trim();
        if (val.isEmpty()) return null;
        return val.length() > maxLen ? val.substring(0, maxLen) : val;
    }

    private Integer clampInt(Integer val, int min, int max) {
        if (val == null) return null;
        return Math.max(min, Math.min(max, val));
    }

    private Double clampDouble(Double val, double min, double max) {
        if (val == null) return null;
        return Math.max(min, Math.min(max, val));
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", message).encode());
    }
}
