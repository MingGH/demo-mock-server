package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.TimePerceptionService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 时间感知扭曲实验室 HTTP 处理器
 * <p>
 * POST /time-perception/submit     — 提交结果
 * GET  /time-perception/stats      — 全局统计
 * GET  /time-perception/leaderboard — 排行榜
 */
public class TimePerceptionHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(TimePerceptionHandler.class);
    private static final int MAX_NAME_LEN = 24;

    private final TimePerceptionService service;

    public TimePerceptionHandler(TimePerceptionService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("POST".equals(method) && path.endsWith("/submit")) {
            handleSubmit(ctx);
        } else if ("GET".equals(method) && path.endsWith("/leaderboard")) {
            handleLeaderboard(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String name = body.getString("name", "").trim();
        Integer totalScore = body.getInteger("totalScore");
        Double weberScore = body.getDouble("weberScore");
        Double avgAbsDistortion = body.getDouble("avgAbsDistortion");
        Double blankAvgDistortion = body.getDouble("blankAvgDistortion");
        Double loadAvgDistortion = body.getDouble("loadAvgDistortion");
        Double emotionAvgDistortion = body.getDouble("emotionAvgDistortion");
        String biasDirection = body.getString("biasDirection", "");
        String grade = body.getString("grade", "");

        if (name.isEmpty() || name.length() > MAX_NAME_LEN) {
            sendError(ctx, 400, "invalid name"); return;
        }
        if (totalScore == null || totalScore < 0 || totalScore > 100) {
            sendError(ctx, 400, "invalid totalScore"); return;
        }
        if (weberScore == null || weberScore < 0 || weberScore > 5) {
            sendError(ctx, 400, "invalid weberScore"); return;
        }
        if (avgAbsDistortion == null || avgAbsDistortion < 0 || avgAbsDistortion > 5) {
            sendError(ctx, 400, "invalid avgAbsDistortion"); return;
        }
        if (blankAvgDistortion == null || blankAvgDistortion < 0 || blankAvgDistortion > 5) {
            sendError(ctx, 400, "invalid blankAvgDistortion"); return;
        }
        if (loadAvgDistortion == null || loadAvgDistortion < 0 || loadAvgDistortion > 5) {
            sendError(ctx, 400, "invalid loadAvgDistortion"); return;
        }
        if (emotionAvgDistortion == null || emotionAvgDistortion < 0 || emotionAvgDistortion > 5) {
            sendError(ctx, 400, "invalid emotionAvgDistortion"); return;
        }
        if (!"overestimator".equals(biasDirection) && !"underestimator".equals(biasDirection) && !"balanced".equals(biasDirection)) {
            sendError(ctx, 400, "invalid biasDirection"); return;
        }
        if (grade.isBlank() || grade.length() > 16) {
            sendError(ctx, 400, "invalid grade"); return;
        }

        service.submit(name, totalScore, weberScore, avgAbsDistortion,
                blankAvgDistortion, loadAvgDistortion, emotionAvgDistortion,
                biasDirection, grade)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("time-perception submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("time-perception stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleLeaderboard(RoutingContext ctx) {
        int limit = parseIntParam(ctx, "limit", 20);
        service.leaderboard(limit)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("time-perception leaderboard error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private int parseIntParam(RoutingContext ctx, String name, int defaultVal) {
        String val = ctx.request().getParam(name);
        if (val == null) return defaultVal;
        try { return Math.max(1, Math.min(100, Integer.parseInt(val))); }
        catch (NumberFormatException e) { return defaultVal; }
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
