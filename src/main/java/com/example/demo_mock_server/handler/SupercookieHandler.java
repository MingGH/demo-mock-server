package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Handler;
import io.vertx.core.buffer.Buffer;
import io.vertx.ext.web.RoutingContext;
import io.vertx.core.json.JsonObject;

/**
 * Favicon Supercookie 处理器。
 *
 * POST /supercookie/session          → 分配 ID
 * GET  /supercookie/pixel            → bit 位 favicon（短缓存）
 * GET  /supercookie/control-cached   → 校准用缓存样本
 * GET  /supercookie/control-network  → 校准用网络样本
 * GET  /supercookie/stats            → 统计
 */
public class SupercookieHandler implements Handler<RoutingContext> {

    private final SupercookieService service;

    private static final byte[] FAVICON_BYTES = {
        (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, (byte)0x90, 0x77, 0x53,
        (byte)0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, (byte)0xD7, 0x63, (byte)0xD8, (byte)0xAC, (byte)0xC5, 0x60,
        0x00, 0x00, 0x00, 0x21, 0x00, 0x01, (byte)0xE5, (byte)0xB0,
        (byte)0x4A, (byte)0x08, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, (byte)0xAE, 0x42, 0x60, (byte)0x82
    };

    public SupercookieHandler(SupercookieService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/session")) {
            sendJson(ctx, 200, service.createWriteSession());
        } else if ("GET".equals(method) && path.endsWith("/control-cached")) {
            ctx.response()
                .putHeader("Content-Type", "image/png")
                .putHeader("Cache-Control", "public, max-age=300")
                .putHeader("CDN-Cache-Control", "no-store")
                .putHeader("Access-Control-Allow-Origin", "*")
                .end(Buffer.buffer(FAVICON_BYTES));
        } else if ("GET".equals(method) && path.endsWith("/control-network")) {
            ctx.response()
                .putHeader("Content-Type", "image/png")
                .putHeader("Cache-Control", "no-store, max-age=0")
                .putHeader("CDN-Cache-Control", "no-store")
                .putHeader("Pragma", "no-cache")
                .putHeader("Access-Control-Allow-Origin", "*")
                .end(Buffer.buffer(FAVICON_BYTES));
        } else if ("GET".equals(method) && path.endsWith("/pixel")) {
            ctx.response()
                .putHeader("Content-Type", "image/png")
                .putHeader("Cache-Control", "public, max-age=5")
                .putHeader("CDN-Cache-Control", "no-store")
                .putHeader("Access-Control-Allow-Origin", "*")
                .end(Buffer.buffer(FAVICON_BYTES));
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            sendJson(ctx, 200, service.stats());
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void sendJson(RoutingContext ctx, int status, JsonObject data) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("data", data).encode());
    }
}
