package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Favicon 超级 Cookie 演示 — HTTP 处理器
 * <p>
 * POST /supercookie/assign   — 分配追踪 ID
 * GET  /supercookie/identify — 识别回访用户
 * GET  /supercookie/stats    — 全局统计
 * DELETE /supercookie/evict  — 清除追踪（模拟手动删 F-Cache）
 */
public class SupercookieHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(SupercookieHandler.class);

    private final SupercookieService service;

    public SupercookieHandler(SupercookieService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/assign")) {
            handleAssign(ctx);
        } else if ("GET".equals(method) && path.endsWith("/identify")) {
            handleIdentify(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else if ("DELETE".equals(method) && path.endsWith("/evict")) {
            handleEvict(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handleAssign(RoutingContext ctx) {
        String ip = resolveIp(ctx);
        JsonObject result = service.assign(ip);
        sendJson(ctx, 200, result);
    }

    private void handleIdentify(RoutingContext ctx) {
        String ip = resolveIp(ctx);
        JsonObject result = service.identify(ip);
        sendJson(ctx, 200, result);
    }

    private void handleStats(RoutingContext ctx) {
        JsonObject result = service.stats();
        sendJson(ctx, 200, result);
    }

    private void handleEvict(RoutingContext ctx) {
        String ip = resolveIp(ctx);
        service.evict(ip);
        sendJson(ctx, 200, new JsonObject().put("evicted", true));
    }

    // ---------- 工具方法 ----------

    protected String resolveIp(RoutingContext ctx) {
        String forwarded = ctx.request().getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = ctx.request().getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        if (ctx.request().remoteAddress() != null) {
            return ctx.request().remoteAddress().host();
        }
        return "unknown";
    }

    private void sendJson(RoutingContext ctx, int status, JsonObject data) {
        ctx.response()
                .setStatusCode(status)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", status).put("data", data).encode());
    }
}
