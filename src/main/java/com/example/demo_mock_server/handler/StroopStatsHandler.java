package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.StroopStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 斯特鲁普效应挑战 HTTP 处理器
 * <p>
 * POST /stroop/submit  — 提交测试结果
 * GET  /stroop/stats   — 查询全局统计
 */
public class StroopStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(StroopStatsHandler.class);

    private final StroopStatsService service;

    public StroopStatsHandler(StroopStatsService service) {
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

    /* ── POST /stroop/submit ── */
    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        Integer total        = body.getInteger("total");
        Integer correctCount = body.getInteger("correctCount");
        Double  accuracy     = body.getDouble("accuracy");
        Double  avgRT        = body.getDouble("avgRT");
        Double  conAvgRT     = body.getDouble("conAvgRT");
        Double  incAvgRT     = body.getDouble("incAvgRT");
        Double  stroopEffect = body.getDouble("stroopEffect");
        String  grade        = body.getString("grade", "");

        // 校验
        if (total == null || total < 1 || total > 100) {
            sendError(ctx, 400, "invalid total"); return;
        }
        if (correctCount == null || correctCount < 0 || correctCount > total) {
            sendError(ctx, 400, "invalid correctCount"); return;
        }
        if (accuracy == null || accuracy < 0 || accuracy > 1) {
            sendError(ctx, 400, "invalid accuracy"); return;
        }
        if (avgRT == null || avgRT < 0 || avgRT > 30000) {
            sendError(ctx, 400, "invalid avgRT"); return;
        }
        if (conAvgRT == null || conAvgRT < 0 || conAvgRT > 30000) {
            sendError(ctx, 400, "invalid conAvgRT"); return;
        }
        if (incAvgRT == null || incAvgRT < 0 || incAvgRT > 30000) {
            sendError(ctx, 400, "invalid incAvgRT"); return;
        }
        if (stroopEffect == null || stroopEffect < -10000 || stroopEffect > 30000) {
            sendError(ctx, 400, "invalid stroopEffect"); return;
        }
        if (grade.isBlank() || grade.length() > 16) {
            sendError(ctx, 400, "invalid grade"); return;
        }

        service.submit(total, correctCount, accuracy, avgRT, conAvgRT, incAvgRT, stroopEffect, grade)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("stroop submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    /* ── GET /stroop/stats ── */
    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("stroop stats error", err);
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
