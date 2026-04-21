package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.CaptchaStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * CAPTCHA 攻防实验室 HTTP 处理器
 * <p>
 * POST /captcha/submit  — 提交挑战结果
 * GET  /captcha/stats   — 查询全局统计
 */
public class CaptchaStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(CaptchaStatsHandler.class);

    private final CaptchaStatsService service;

    public CaptchaStatsHandler(CaptchaStatsService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/submit")) {
            handleSubmit(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    /* ── POST /captcha/submit ── */
    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        Integer passedCount = body.getInteger("passedCount");
        Integer totalTimeMs = body.getInteger("totalTimeMs");
        String  grade       = body.getString("grade");
        JsonObject levels   = body.getJsonObject("levels");

        if (passedCount == null || passedCount < 0 || passedCount > 8) {
            sendError(ctx, 400, "invalid passedCount"); return;
        }
        if (totalTimeMs == null || totalTimeMs < 0 || totalTimeMs > 600000) {
            sendError(ctx, 400, "invalid totalTimeMs"); return;
        }
        if (grade == null || grade.isBlank() || grade.length() > 4) {
            sendError(ctx, 400, "invalid grade"); return;
        }
        if (levels == null) {
            sendError(ctx, 400, "missing levels"); return;
        }

        service.submit(body)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("captcha submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    /* ── GET /captcha/stats ── */
    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("captcha stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void ok(RoutingContext ctx, JsonObject data) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", 200).put("data", data).encode());
    }

    private void sendError(RoutingContext ctx, int status, String msg) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", msg).encode());
    }
}
