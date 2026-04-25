package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.InceptionMazeService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 筑梦师测试 HTTP 处理器
 * <p>
 * POST /inception-maze/submit  — 提交测试结果，返回排名
 * GET  /inception-maze/stats   — 查询全局统计
 */
public class InceptionMazeHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(InceptionMazeHandler.class);

    private final InceptionMazeService service;

    public InceptionMazeHandler(InceptionMazeService service) {
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
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        Integer gridSize   = body.getInteger("gridSize");
        Integer pathLength = body.getInteger("pathLength");
        Integer minPath    = body.getInteger("minPath");
        Double  detour     = body.getDouble("detourRatio");
        Integer level      = body.getInteger("dreamLevel");
        Integer wallCount  = body.getInteger("wallCount");

        if (gridSize == null || gridSize < 5 || gridSize > 50) {
            sendError(ctx, 400, "invalid gridSize"); return;
        }
        if (pathLength == null || pathLength < 1 || pathLength > 10000) {
            sendError(ctx, 400, "invalid pathLength"); return;
        }
        if (minPath == null || minPath < 1 || minPath > 10000) {
            sendError(ctx, 400, "invalid minPath"); return;
        }
        if (detour == null || detour < 0.5 || detour > 1000) {
            sendError(ctx, 400, "invalid detourRatio"); return;
        }
        if (level == null || level < 0 || level > 5) {
            sendError(ctx, 400, "invalid dreamLevel"); return;
        }
        if (wallCount == null || wallCount < 0 || wallCount > 10000) {
            sendError(ctx, 400, "invalid wallCount"); return;
        }

        service.submit(body)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("inception-maze submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("inception-maze stats error", err);
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
