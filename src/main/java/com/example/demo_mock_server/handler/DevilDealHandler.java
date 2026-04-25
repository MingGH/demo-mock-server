package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.DevilDealService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 恶魔交易诊断 HTTP 处理器
 * <p>
 * POST /devil-deal/submit  — 提交测试结果
 * GET  /devil-deal/stats   — 查询全局统计
 */
public class DevilDealHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(DevilDealHandler.class);

    private final DevilDealService service;

    public DevilDealHandler(DevilDealService service) {
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

        String  dealType       = body.getString("dealType", "");
        String  secondType     = body.getString("secondType", "");
        Integer powerPct       = body.getInteger("powerPct");
        Integer lovePct        = body.getInteger("lovePct");
        Integer moneyPct       = body.getInteger("moneyPct");
        Integer revengePct     = body.getInteger("revengePct");
        Integer recognitionPct = body.getInteger("recognitionPct");
        Integer knowledgePct   = body.getInteger("knowledgePct");

        if (!service.isValidType(dealType)) {
            sendError(ctx, 400, "invalid dealType"); return;
        }
        if (!service.isValidType(secondType)) {
            sendError(ctx, 400, "invalid secondType"); return;
        }
        if (!service.isValidPct(powerPct)) {
            sendError(ctx, 400, "invalid powerPct"); return;
        }
        if (!service.isValidPct(lovePct)) {
            sendError(ctx, 400, "invalid lovePct"); return;
        }
        if (!service.isValidPct(moneyPct)) {
            sendError(ctx, 400, "invalid moneyPct"); return;
        }
        if (!service.isValidPct(revengePct)) {
            sendError(ctx, 400, "invalid revengePct"); return;
        }
        if (!service.isValidPct(recognitionPct)) {
            sendError(ctx, 400, "invalid recognitionPct"); return;
        }
        if (!service.isValidPct(knowledgePct)) {
            sendError(ctx, 400, "invalid knowledgePct"); return;
        }

        service.submit(dealType, secondType, powerPct, lovePct, moneyPct,
                       revengePct, recognitionPct, knowledgePct)
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("devil-deal submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("devil-deal stats error", err);
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
