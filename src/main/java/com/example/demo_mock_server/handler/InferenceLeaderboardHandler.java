package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.InferenceLeaderboardService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 统计侦探排行榜
 * POST /inference/leaderboard  — 提交成绩
 * GET  /inference/leaderboard  — 查询 top 榜
 */
public class InferenceLeaderboardHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(InferenceLeaderboardHandler.class);
    private static final int MAX_NAME_LEN = 24;

    private final InferenceLeaderboardService service;

    public InferenceLeaderboardHandler(InferenceLeaderboardService service) {
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

        String name = sanitize(body.getString("name"));
        if (name.isEmpty()) { sendError(ctx, 400, "name is required"); return; }

        Integer score  = body.getInteger("score");
        Integer rounds = body.getInteger("rounds");
        Integer wins   = body.getInteger("wins");
        String  grade  = body.getString("grade", "");

        if (score == null || score < 0 || score > 600) { sendError(ctx, 400, "invalid score"); return; }
        if (rounds == null || rounds < 1 || rounds > 6) { sendError(ctx, 400, "invalid rounds"); return; }
        if (wins == null || wins < 0 || wins > rounds)  { sendError(ctx, 400, "invalid wins"); return; }
        if (grade.isBlank() || grade.length() > 16)     { sendError(ctx, 400, "invalid grade"); return; }

        service.submit(name, score, rounds, wins, grade)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> { log.error("submit error", err); sendError(ctx, 500, "Internal error"); });
    }

    private void handleGet(RoutingContext ctx) {
        String limitStr = ctx.request().getParam("limit");
        int limit = 20;
        try { if (limitStr != null) limit = Integer.parseInt(limitStr); } catch (NumberFormatException ignored) {}

        service.top(limit)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> { log.error("top error", err); sendError(ctx, 500, "Internal error"); });
    }

    private String sanitize(String raw) {
        if (raw == null) return "";
        String s = raw.trim().replaceAll("\\s+", " ");
        return s.length() > MAX_NAME_LEN ? s.substring(0, MAX_NAME_LEN) : s;
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
