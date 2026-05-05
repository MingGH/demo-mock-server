package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.CosmicReaperService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 宇宙收割者假说 HTTP 处理器
 * <p>
 * POST /cosmic-reaper/submit — 提交模拟结果
 * GET  /cosmic-reaper/stats  — 查询全局统计
 */
public class CosmicReaperHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(CosmicReaperHandler.class);

    private final CosmicReaperService service;

    public CosmicReaperHandler(CosmicReaperService service) {
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

    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String strategy = body.getString("strategy", "").trim();
        Boolean escaped = body.getBoolean("escaped");
        Integer turns = body.getInteger("turns");
        Integer score = body.getInteger("score");
        Integer finalTech = body.getInteger("finalTech");
        Integer finalSignal = body.getInteger("finalSignal");
        Integer finalStealth = body.getInteger("finalStealth");

        if (!isValidStrategy(strategy)) {
            sendError(ctx, 400, "invalid strategy"); return;
        }
        if (escaped == null || turns == null || score == null) {
            sendError(ctx, 400, "missing required fields"); return;
        }
        if (turns < 0 || turns > 100 || score < 0 || score > 100) {
            sendError(ctx, 400, "invalid turns or score"); return;
        }

        service.submit(strategy, escaped, turns, score,
                finalTech != null ? finalTech : 0,
                finalSignal != null ? finalSignal : 0,
                finalStealth != null ? finalStealth : 0)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("cosmic-reaper submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.getStats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("cosmic-reaper stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private boolean isValidStrategy(String s) {
        return "aggressive".equals(s) || "balanced".equals(s)
            || "stealth".equals(s) || "dormant".equals(s);
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
