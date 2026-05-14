package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.VeilOfIgnoranceService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class VeilOfIgnoranceHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(VeilOfIgnoranceHandler.class);

    private final VeilOfIgnoranceService service;

    public VeilOfIgnoranceHandler(VeilOfIgnoranceService service) {
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

        JsonObject policies = body.getJsonObject("policies");
        JsonObject attrs = body.getJsonObject("attrs");
        JsonObject result = body.getJsonObject("result");

        if (policies == null || attrs == null || result == null) {
            sendError(ctx, 400, "Missing policies/attrs/result"); return;
        }

        service.submit(body)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("veil submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("veil stats error", err);
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
