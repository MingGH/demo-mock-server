package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.BarnumStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 巴纳姆效应盲测 HTTP 处理器
 * <p>
 * POST /barnum-test/submit — 提交测试结果
 * GET  /barnum-test/stats  — 查询全局分组统计
 */
public class BarnumStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(BarnumStatsHandler.class);

    private final BarnumStatsService service;

    public BarnumStatsHandler(BarnumStatsService service) {
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

    /* ── POST /barnum-test/submit ── */
    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String userGroup = body.getString("userGroup");
        if (userGroup == null || (!"tarot".equals(userGroup) && !"random".equals(userGroup))) {
            sendError(ctx, 400, "invalid userGroup"); return;
        }

        int[] ratings = new int[5];
        for (int i = 0; i < 5; i++) {
            Integer r = body.getInteger("rating" + (i + 1));
            if (r == null || r < 1 || r > 5) {
                sendError(ctx, 400, "invalid rating" + (i + 1)); return;
            }
            ratings[i] = r;
        }

        service.submit(userGroup, ratings[0], ratings[1], ratings[2], ratings[3], ratings[4])
            .onSuccess(v -> ok(ctx, new JsonObject().put("submitted", true)))
            .onFailure(err -> {
                log.error("barnum submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    /* ── GET /barnum-test/stats ── */
    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("barnum stats error", err);
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
