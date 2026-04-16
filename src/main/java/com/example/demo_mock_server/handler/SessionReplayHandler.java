package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SessionReplayRecord;
import com.example.demo_mock_server.service.SessionReplayService;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.regex.Pattern;

/**
 * 会话回放 demo HTTP 处理器
 * POST /session-replay/submit
 * GET  /session-replay/stats
 * GET  /session-replay/session/:sessionId
 */
public class SessionReplayHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(SessionReplayHandler.class);
    private static final Pattern UUID_PATTERN =
        Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final int MAX_QUESTIONS = 8;
    private static final int MAX_EVENTS = 600;

    private final SessionReplayService service;

    public SessionReplayHandler(SessionReplayService service) {
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
        } else if ("GET".equals(method) && path.contains("/session/")) {
            handleSession(ctx);
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

        String sessionId = body.getString("sessionId", "");
        if (!UUID_PATTERN.matcher(sessionId).matches()) {
            sendError(ctx, 400, "Invalid sessionId");
            return;
        }

        Integer questionCount = clampInt(body.getInteger("questionCount"), 1, MAX_QUESTIONS);
        Long durationMs = clampLong(body.getLong("durationMs"), 0L, 30L * 60 * 1000);
        Integer typedChars = clampInt(body.getInteger("typedChars"), 0, 4000);
        Integer focusSwitches = clampInt(body.getInteger("focusSwitches"), 0, 500);
        Double maxScrollPct = clampDouble(body.getDouble("maxScrollPct"), 0.0, 100.0);
        JsonObject answers = body.getJsonObject("answers");
        JsonArray rawEvents = body.getJsonArray("events");

        if (questionCount == null || durationMs == null || typedChars == null
                || focusSwitches == null || maxScrollPct == null || answers == null
                || rawEvents == null || rawEvents.isEmpty()) {
            sendError(ctx, 400, "Missing required fields");
            return;
        }

        JsonArray events = sanitizeEvents(rawEvents, durationMs);
        if (events.isEmpty()) {
            sendError(ctx, 400, "No valid events");
            return;
        }

        SessionReplayRecord record = new SessionReplayRecord(
            sessionId,
            questionCount,
            durationMs,
            events.size(),
            typedChars,
            focusSwitches,
            maxScrollPct,
            sanitizeAnswers(answers),
            events
        );

        service.submit(record)
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("session replay submit error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("session replay stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleSession(RoutingContext ctx) {
        String sessionId = ctx.pathParam("sessionId");
        if (sessionId == null || !UUID_PATTERN.matcher(sessionId).matches()) {
            sendError(ctx, 400, "Invalid sessionId");
            return;
        }

        service.getSession(sessionId)
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                if ("NOT_FOUND".equals(err.getMessage())) {
                    sendError(ctx, 404, "Session not found");
                    return;
                }
                log.error("session replay getSession error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private JsonObject sanitizeAnswers(JsonObject answers) {
        JsonObject clean = new JsonObject();
        answers.fieldNames().stream().limit(16).forEach(key -> {
            Object value = answers.getValue(key);
            String safeKey = sanitize(key, 32);
            if (safeKey == null) {
                return;
            }
            if (value instanceof String s) {
                clean.put(safeKey, sanitize(s, 500));
            } else if (value instanceof JsonArray arr) {
                JsonArray safeArray = new JsonArray();
                for (int i = 0; i < Math.min(arr.size(), 12); i++) {
                    Object item = arr.getValue(i);
                    if (item instanceof String s) {
                        String safe = sanitize(s, 120);
                        if (safe != null) {
                            safeArray.add(safe);
                        }
                    }
                }
                clean.put(safeKey, safeArray);
            } else if (value instanceof Number || value instanceof Boolean) {
                clean.put(safeKey, value);
            }
        });
        return clean;
    }

    private JsonArray sanitizeEvents(JsonArray rawEvents, long durationMs) {
        JsonArray clean = new JsonArray();
        int limit = Math.min(rawEvents.size(), MAX_EVENTS);

        for (int i = 0; i < limit; i++) {
            Object item = rawEvents.getValue(i);
            if (!(item instanceof JsonObject event)) {
                continue;
            }

            String type = sanitize(event.getString("type"), 24);
            String target = sanitize(event.getString("target"), 48);
            Long ts = clampLong(event.getLong("ts"), 0L, durationMs + 5000);
            String value = sanitize(event.getString("value"), 200);
            JsonObject meta = sanitizeMeta(event.getJsonObject("meta"));

            if (type == null || target == null || ts == null) {
                continue;
            }

            JsonObject cleaned = new JsonObject()
                .put("ts", ts)
                .put("type", type)
                .put("target", target);

            if (value != null) {
                cleaned.put("value", value);
            }
            if (!meta.isEmpty()) {
                cleaned.put("meta", meta);
            }

            clean.add(cleaned);
        }

        return clean;
    }

    private JsonObject sanitizeMeta(JsonObject meta) {
        JsonObject clean = new JsonObject();
        if (meta == null) {
            return clean;
        }

        meta.fieldNames().stream().limit(10).forEach(key -> {
            String safeKey = sanitize(key, 24);
            if (safeKey == null) {
                return;
            }

            Object value = meta.getValue(key);
            if (value instanceof String s) {
                String safeValue = sanitize(s, 120);
                if (safeValue != null) {
                    clean.put(safeKey, safeValue);
                }
            } else if (value instanceof Number) {
                clean.put(safeKey, value);
            } else if (value instanceof Boolean) {
                clean.put(safeKey, value);
            }
        });

        return clean;
    }

    protected String sanitize(String value, int maxLen) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() > maxLen ? trimmed.substring(0, maxLen) : trimmed;
    }

    protected Integer clampInt(Integer value, int min, int max) {
        if (value == null) {
            return null;
        }
        return Math.max(min, Math.min(max, value));
    }

    protected Long clampLong(Long value, long min, long max) {
        if (value == null) {
            return null;
        }
        return Math.max(min, Math.min(max, value));
    }

    protected Double clampDouble(Double value, double min, double max) {
        if (value == null) {
            return null;
        }
        return Math.max(min, Math.min(max, value));
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", message).encode());
    }
}
