package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.NimGameStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;

/**
 * 尼姆游戏对局统计
 * POST /nim-game/submit  — 提交对局结果
 * GET  /nim-game/stats   — 查询全局统计
 */
public class NimGameStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(NimGameStatsHandler.class);
    private static final Set<String> VALID_RESULTS = Set.of("win", "lose");
    private static final Set<String> VALID_DIFFICULTIES = Set.of("easy", "normal", "hard");

    private final NimGameStatsService service;

    public NimGameStatsHandler(NimGameStatsService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        if ("POST".equals(method)) handlePost(ctx);
        else if ("GET".equals(method)) handleGet(ctx);
        else ctx.response().setStatusCode(405).end();
    }

    private void handlePost(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String result = body.getString("result", "");
        String difficulty = body.getString("difficulty", "");
        Integer rounds = body.getInteger("rounds");
        String preset = body.getString("preset", "classic");

        if (!VALID_RESULTS.contains(result)) { sendError(ctx, 400, "invalid result"); return; }
        if (!VALID_DIFFICULTIES.contains(difficulty)) { sendError(ctx, 400, "invalid difficulty"); return; }
        if (rounds == null || rounds < 1 || rounds > 200) { sendError(ctx, 400, "invalid rounds"); return; }
        if (preset.length() > 16) { sendError(ctx, 400, "invalid preset"); return; }

        service.submit(result, difficulty, rounds, preset)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> { log.error("nim submit error", err); sendError(ctx, 500, "Internal error"); });
    }

    private void handleGet(RoutingContext ctx) {
        service.getStats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> { log.error("nim stats error", err); sendError(ctx, 500, "Internal error"); });
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
