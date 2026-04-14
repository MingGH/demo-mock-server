package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Handler;
import io.vertx.core.buffer.Buffer;
import io.vertx.ext.web.RoutingContext;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Favicon Supercookie API 处理器。
 *
 * 路由：
 *   POST /supercookie/session       → 创建写入 session，分配 ID
 *   GET  /supercookie/favicon/:bit  → 返回 favicon 图片（按 bit 值控制缓存头）
 *   POST /supercookie/probe-session → 创建探测 session
 *   GET  /supercookie/probe/:bit    → 探测请求（记录到达）
 *   GET  /supercookie/resolve       → 汇总探测结果，还原 ID
 *   GET  /supercookie/stats         → 全局统计
 */
public class SupercookieHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(SupercookieHandler.class);

    private final SupercookieService service;

    // 1x1 紫色 PNG (最小有效 PNG)
    private static final byte[] FAVICON_BYTES;
    static {
        // 1x1 pixel PNG, purple (#764ba2)
        FAVICON_BYTES = new byte[] {
            (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
            0x08, 0x02, 0x00, 0x00, 0x00, (byte)0x90, 0x77, 0x53,
            (byte)0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
            0x54, 0x08, (byte)0xD7, 0x63, (byte)0xD8, (byte)0xAC, (byte)0xC5, 0x60,
            0x00, 0x00, 0x00, 0x21, 0x00, 0x01, (byte)0xE5, (byte)0xB0,
            (byte)0x4A, (byte)0x08, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
            0x4E, 0x44, (byte)0xAE, 0x42, 0x60, (byte)0x82
        };
    }

    public SupercookieHandler(SupercookieService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/session")) {
            handleCreateSession(ctx);
        } else if ("GET".equals(method) && path.contains("/favicon/")) {
            handleFavicon(ctx);
        } else if ("POST".equals(method) && path.endsWith("/probe-session")) {
            handleCreateProbeSession(ctx);
        } else if ("GET".equals(method) && path.contains("/probe/")) {
            handleProbe(ctx);
        } else if ("GET".equals(method) && path.endsWith("/resolve")) {
            handleResolve(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handleCreateSession(RoutingContext ctx) {
        JsonObject result = service.createWriteSession();
        sendJson(ctx, 200, result);
    }

    private void handleFavicon(RoutingContext ctx) {
        String token = ctx.request().getParam("token");
        int bitIndex = parseBitIndex(ctx.request().path());
        if (token == null || bitIndex < 0) {
            ctx.response().setStatusCode(400).end();
            return;
        }

        int bitValue = service.getFaviconBit(token, bitIndex);
        if (bitValue < 0) {
            ctx.response().setStatusCode(404).end();
            return;
        }

        ctx.response()
                .putHeader("Content-Type", "image/png")
                .putHeader("Access-Control-Allow-Origin", "*")
                .putHeader("Timing-Allow-Origin", "*");

        if (bitValue == 1) {
            // 缓存：浏览器会缓存这个 favicon
            ctx.response()
                    .putHeader("Cache-Control", "public, max-age=31536000, immutable")
                    .putHeader("ETag", "\"fcache-" + bitIndex + "-1\"");
        } else {
            // 不缓存
            ctx.response()
                    .putHeader("Cache-Control", "no-store, no-cache, must-revalidate")
                    .putHeader("Pragma", "no-cache");
        }

        ctx.response().end(Buffer.buffer(FAVICON_BYTES));
    }

    private void handleCreateProbeSession(RoutingContext ctx) {
        JsonObject result = service.createProbeSession();
        sendJson(ctx, 200, result);
    }

    private void handleProbe(RoutingContext ctx) {
        String token = ctx.request().getParam("token");
        int bitIndex = parseBitIndex(ctx.request().path());
        if (token == null || bitIndex < 0) {
            ctx.response().setStatusCode(400).end();
            return;
        }

        service.recordProbeHit(token, bitIndex);

        // 返回一个不缓存的 1x1 PNG（探测阶段所有响应都不缓存）
        ctx.response()
                .putHeader("Content-Type", "image/png")
                .putHeader("Cache-Control", "no-store, no-cache, must-revalidate")
                .putHeader("Pragma", "no-cache")
                .putHeader("Access-Control-Allow-Origin", "*")
                .end(Buffer.buffer(FAVICON_BYTES));
    }

    private void handleResolve(RoutingContext ctx) {
        String token = ctx.request().getParam("token");
        if (token == null) {
            sendJson(ctx, 400, new JsonObject().put("error", "missing token"));
            return;
        }
        JsonObject result = service.resolveProbe(token);
        sendJson(ctx, 200, result);
    }

    private void handleStats(RoutingContext ctx) {
        JsonObject result = service.stats();
        sendJson(ctx, 200, result);
    }

    // ---------- 工具方法 ----------

    /**
     * 从路径中提取 bit index，如 /supercookie/favicon/3 → 3
     */
    private int parseBitIndex(String path) {
        try {
            String[] parts = path.split("/");
            return Integer.parseInt(parts[parts.length - 1]);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private void sendJson(RoutingContext ctx, int status, JsonObject data) {
        ctx.response()
                .setStatusCode(status)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", status).put("data", data).encode());
    }
}
