package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.NewcombService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 纽科姆悖论 HTTP 处理器
 * <p>
 * POST /newcomb/submit  — 提交选择结果
 * GET  /newcomb/stats   — 查询全局统计
 */
public class NewcombHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(NewcombHandler.class);

    private final NewcombService service;

    public NewcombHandler(NewcombService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path   = ctx.request().path();

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
        if (body == null) {
            sendError(ctx, 400, "Invalid JSON");
            return;
        }

        String  choice     = body.getString("choice", "");
        String  prediction = body.getString("prediction", "");
        Boolean hit        = body.getBoolean("hit");
        Integer payoff     = body.getInteger("payoff");

        if (!service.isValidChoice(choice)) {
            sendError(ctx, 400, "invalid choice, must be 'one' or 'two'");
            return;
        }
        if (!service.isValidChoice(prediction)) {
            sendError(ctx, 400, "invalid prediction, must be 'one' or 'two'");
            return;
        }
        if (hit == null) {
            sendError(ctx, 400, "missing hit");
            return;
        }
        if (payoff == null || payoff < 0) {
            sendError(ctx, 400, "invalid payoff");
            return;
        }

        service.submit(choice, prediction, hit, payoff)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("newcomb submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("newcomb stats error", err);
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
