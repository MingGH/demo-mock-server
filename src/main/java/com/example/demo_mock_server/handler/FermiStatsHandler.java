package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.FermiStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 费米估算挑战 HTTP 处理器
 * <p>
 * POST /fermi/submit  — 提交挑战结果
 * GET  /fermi/stats   — 查询全局统计
 */
public class FermiStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(FermiStatsHandler.class);

    private final FermiStatsService service;

    public FermiStatsHandler(FermiStatsService service) {
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

        Double avgOOM    = body.getDouble("avgOOM");
        Integer withinOOM = body.getInteger("withinOOM");
        String grade      = body.getString("grade");

        if (avgOOM == null || avgOOM < 0 || avgOOM > 20) {
            sendError(ctx, 400, "invalid avgOOM"); return;
        }
        if (withinOOM == null || withinOOM < 0 || withinOOM > 10) {
            sendError(ctx, 400, "invalid withinOOM"); return;
        }
        if (grade == null || grade.isBlank() || grade.length() > 4) {
            sendError(ctx, 400, "invalid grade"); return;
        }

        service.submit(avgOOM, withinOOM, grade)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("fermi submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("fermi stats error", err);
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
