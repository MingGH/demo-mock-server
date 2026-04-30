package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.CascadeFailureService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CascadeFailureHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(CascadeFailureHandler.class);

    private final CascadeFailureService service;

    public CascadeFailureHandler(CascadeFailureService service) {
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
        } else if ("GET".equals(method) && path.endsWith("/leaderboard")) {
            handleLeaderboard(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String topology = body.getString("topology", "").trim();
        int coupling = body.getInteger("coupling", 0);
        int capacity = body.getInteger("capacity", 0);
        String strategy = body.getString("strategy", "").trim();
        String triggerPos = body.getString("triggerPos", "").trim();
        Double survivalRate = body.getDouble("survivalRate");
        Integer cascadeSteps = body.getInteger("cascadeSteps");
        Integer maxComponent = body.getInteger("maxComponent");
        Integer totalNodes = body.getInteger("totalNodes");
        Integer score = body.getInteger("score");

        if (!isValidTopology(topology) || !isValidStrategy(strategy)) {
            sendError(ctx, 400, "invalid topology or strategy"); return;
        }
        if (coupling < 10 || coupling > 90 || capacity < 5 || capacity > 95) {
            sendError(ctx, 400, "invalid params"); return;
        }
        if (survivalRate == null || survivalRate < 0 || survivalRate > 1) {
            sendError(ctx, 400, "invalid survivalRate"); return;
        }
        if (cascadeSteps == null || cascadeSteps < 0 || cascadeSteps > 1000) {
            sendError(ctx, 400, "invalid cascadeSteps"); return;
        }
        if (score == null || score < 0 || score > 100) {
            sendError(ctx, 400, "invalid score"); return;
        }

        service.submit(topology, coupling, capacity, strategy, triggerPos,
                survivalRate, cascadeSteps, maxComponent != null ? maxComponent : 0,
                totalNodes != null ? totalNodes : 0, score)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("cascade-failure submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("cascade-failure stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleLeaderboard(RoutingContext ctx) {
        int limit = parseIntParam(ctx, "limit", 20);
        service.leaderboard(limit)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("cascade-failure leaderboard error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private int parseIntParam(RoutingContext ctx, String name, int defaultVal) {
        String val = ctx.request().getParam(name);
        if (val == null) return defaultVal;
        try { return Math.max(1, Math.min(100, Integer.parseInt(val))); }
        catch (NumberFormatException e) { return defaultVal; }
    }

    private boolean isValidTopology(String t) {
        return "random".equals(t) || "scale-free".equals(t) || "grid".equals(t) || "modular".equals(t);
    }
    private boolean isValidStrategy(String s) {
        return "none".equals(s) || "hub".equals(s) || "distributed".equals(s);
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
