package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.FingerprintRecord;
import com.example.demo_mock_server.service.FingerprintService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 浏览器指纹 HTTP 处理器
 * POST /fingerprint/collect
 * GET  /fingerprint/stats
 */
public class BrowserFingerprintHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(BrowserFingerprintHandler.class);

    private final FingerprintService service;

    public BrowserFingerprintHandler(FingerprintService service) {
        this.service = service;
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

        String ipHint = ctx.request().getHeader("X-Forwarded-For");
        if (ipHint != null) ipHint = ipHint.split(",")[0].trim();
        if (ipHint == null && ctx.request().remoteAddress() != null) {
            ipHint = ctx.request().remoteAddress().host();
        }

        FingerprintRecord record = FingerprintRecord.of(
            fullHash,
            sanitize(body.getString("canvasHash"), 64),
            sanitize(body.getString("fontHash"), 64),
            sanitize(body.getString("webglHash"), 64),
            sanitize(body.getString("screenInfo"), 128),
            sanitize(body.getString("timezone"), 64),
            sanitize(body.getString("language"), 32),
            sanitize(body.getString("platform"), 64),
            clampInt(body.getInteger("hardwareConcurrency"), 1, 256),
            clampInt(body.getInteger("deviceMemory"), 0, 128),
            Boolean.TRUE.equals(body.getBoolean("touchSupport")),
            clampInt(body.getInteger("colorDepth"), 1, 64),
            clampDouble(body.getDouble("pixelRatio"), 0.5, 10.0),
            clampDouble(body.getDouble("entropyBits"), 0.0, 64.0),
            sanitize(ipHint, 64)
        );

        service.collect(record).onSuccess(data ->
            ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode())
        ).onFailure(err -> {
            log.error("Collect handler error", err);
            sendError(ctx, 500, "Internal error");
        });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats().onSuccess(data ->
            ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode())
        ).onFailure(err -> {
            log.error("Stats handler error", err);
            sendError(ctx, 500, "DB error");
        });
    }

    // ── 输入清洗工具（protected 供测试访问） ──────────────────────────────
    protected String sanitize(String val, int maxLen) {
        if (val == null) return null;
        val = val.trim();
        if (val.isEmpty()) return null;
        return val.length() > maxLen ? val.substring(0, maxLen) : val;
    }

    protected Integer clampInt(Integer val, int min, int max) {
        if (val == null) return null;
        return Math.max(min, Math.min(max, val));
    }

    protected Double clampDouble(Double val, double min, double max) {
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
