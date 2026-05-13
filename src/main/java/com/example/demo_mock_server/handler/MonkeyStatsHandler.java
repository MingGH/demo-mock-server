package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.MonkeyStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MonkeyStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(MonkeyStatsHandler.class);

    private final MonkeyStatsService service;

    public MonkeyStatsHandler(MonkeyStatsService service) {
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

        String targetText = body.getString("targetText", "").trim().toLowerCase();
        Integer targetLength = body.getInteger("targetLength");
        Long totalAttempts = body.getLong("totalAttempts");
        Long totalChars = body.getLong("totalChars");
        Boolean success = body.getBoolean("success");
        Integer timeElapsed = body.getInteger("timeElapsed");

        if (targetText.isEmpty() || targetLength == null || totalAttempts == null ||
            totalChars == null || success == null || timeElapsed == null) {
            sendError(ctx, 400, "Missing required fields"); return;
        }
        if (targetLength < 1 || targetLength > 12) {
            sendError(ctx, 400, "Invalid targetLength"); return;
        }
        if (totalAttempts < 0 || totalChars < 0) {
            sendError(ctx, 400, "Invalid counts"); return;
        }

        service.submit(targetText, targetLength, totalAttempts, totalChars, success, timeElapsed)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("monkey submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("monkey stats error", err);
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
