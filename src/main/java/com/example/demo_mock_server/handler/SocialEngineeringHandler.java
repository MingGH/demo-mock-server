package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SocialEngineeringRecord;
import com.example.demo_mock_server.service.SocialEngineeringService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 社会工程学防骗挑战 HTTP 处理器
 * POST /social-engineering/submit
 * GET  /social-engineering/stats
 */
public class SocialEngineeringHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(SocialEngineeringHandler.class);
    private static final Pattern UUID_PATTERN =
        Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final int MAX_QUESTIONS = 20;

    private final SocialEngineeringService service;

    public SocialEngineeringHandler(SocialEngineeringService service) {
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

    // ── POST /social-engineering/submit ──────────────────────────────────
    private void handleSubmit(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) { sendError(ctx, 400, "Invalid JSON"); return; }

        String sessionId = body.getString("sessionId", "");
        if (!UUID_PATTERN.matcher(sessionId).matches()) {
            sendError(ctx, 400, "Invalid sessionId"); return;
        }

        Integer total   = body.getInteger("total");
        Integer correct = body.getInteger("correct");
        if (total == null || correct == null || total < 1 || total > MAX_QUESTIONS
                || correct < 0 || correct > total) {
            sendError(ctx, 400, "Invalid total/correct"); return;
        }

        JsonArray rawQuestions = body.getJsonArray("questions");
        if (rawQuestions == null || rawQuestions.isEmpty()) {
            sendError(ctx, 400, "questions required"); return;
        }

        List<SocialEngineeringRecord.QuestionResult> questions = new ArrayList<>();
        for (int i = 0; i < Math.min(rawQuestions.size(), MAX_QUESTIONS); i++) {
            Object item = rawQuestions.getValue(i);
            if (!(item instanceof JsonObject q)) continue;

            Integer qId = q.getInteger("questionId");
            String tactic = q.getString("tactic", "");
            Boolean isFake = q.getBoolean("isFake");
            Boolean qCorrect = q.getBoolean("correct");

            if (qId == null || qId < 1 || qId > MAX_QUESTIONS
                    || tactic.isBlank() || isFake == null || qCorrect == null) continue;

            questions.add(new SocialEngineeringRecord.QuestionResult(
                qId,
                tactic.substring(0, Math.min(tactic.length(), 32)),
                isFake,
                qCorrect
            ));
        }

        if (questions.isEmpty()) { sendError(ctx, 400, "No valid questions"); return; }

        SocialEngineeringRecord record = new SocialEngineeringRecord(sessionId, total, correct, questions);

        service.submit(record)
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    // ── GET /social-engineering/stats ────────────────────────────────────
    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", message).encode());
    }
}
