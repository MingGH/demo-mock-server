package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.TarotTuringStatsService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;

/**
 * 塔罗图灵测试 HTTP 处理器
 */
public class TarotTuringStatsHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(TarotTuringStatsHandler.class);

    private static final Set<String> VALID_SLOTS = Set.of("A", "B", "C");
    private static final Set<String> VALID_ROLES = Set.of("template", "human", "ai");

    private final TarotTuringStatsService service;

    public TarotTuringStatsHandler(TarotTuringStatsService service) {
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
        if (body == null) {
            sendError(ctx, 400, "Invalid JSON");
            return;
        }

        String sessionSeed = trim(body.getString("sessionSeed"));
        String spreadId = trim(body.getString("spreadId"));
        String bestSlot = trim(body.getString("bestSlot"));
        String bestRole = trim(body.getString("bestRole"));
        String guessedAiSlot = trim(body.getString("guessedAiSlot"));
        String guessedAiRole = trim(body.getString("guessedAiRole"));
        Boolean guessedAiCorrect = body.getBoolean("guessedAiCorrect");

        if (sessionSeed == null || sessionSeed.length() > 64) {
            sendError(ctx, 400, "invalid sessionSeed");
            return;
        }
        if (spreadId == null || spreadId.length() > 64) {
            sendError(ctx, 400, "invalid spreadId");
            return;
        }
        if (!VALID_SLOTS.contains(bestSlot) || !VALID_SLOTS.contains(guessedAiSlot)) {
            sendError(ctx, 400, "invalid slot");
            return;
        }
        if (!VALID_ROLES.contains(bestRole) || !VALID_ROLES.contains(guessedAiRole)) {
            sendError(ctx, 400, "invalid role");
            return;
        }
        if (guessedAiCorrect == null) {
            sendError(ctx, 400, "invalid guessedAiCorrect");
            return;
        }

        service.submit(sessionSeed, spreadId, bestSlot, bestRole, guessedAiSlot, guessedAiRole, guessedAiCorrect)
            .onSuccess(v -> ok(ctx, new JsonObject().put("submitted", true)))
            .onFailure(err -> {
                log.error("tarot turing submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ok(ctx, data))
            .onFailure(err -> {
                log.error("tarot turing stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void ok(RoutingContext ctx, JsonObject data) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", 200).put("data", data).encode());
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", message).encode());
    }

    private String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
