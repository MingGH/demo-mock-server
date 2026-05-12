package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SecKillStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SecKillStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(SecKillStatsHandler.class);

    private final SecKillStatsService service;

    public SecKillStatsHandler(SecKillStatsService service) {
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

        Integer participants = body.getInteger("participants");
        Integer stock = body.getInteger("stock");
        Boolean userWon = body.getBoolean("userWon");
        Integer userRank = body.getInteger("userRank");
        Double userLatency = body.getDouble("userLatency");
        Double latencyGap = body.getDouble("latencyGap");

        if (participants == null || stock == null || userWon == null ||
            userRank == null || userLatency == null || latencyGap == null) {
            sendError(ctx, 400, "Missing required fields"); return;
        }
        if (participants < 1 || participants > 100000) {
            sendError(ctx, 400, "Invalid participants"); return;
        }
        if (stock < 1 || stock > participants) {
            sendError(ctx, 400, "Invalid stock"); return;
        }

        service.submit(participants, stock, userWon, userRank, userLatency, latencyGap)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("seckill submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("seckill stats error", err);
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
