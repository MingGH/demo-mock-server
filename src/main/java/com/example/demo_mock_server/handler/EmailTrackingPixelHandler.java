package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.EmailTrackingPixelService;
import io.vertx.core.Handler;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Email Tracking Pixel demo 接口。
 * GET  /email-tracking/pixel.gif
 * GET  /email-tracking/stats
 * POST /email-tracking/reset
 */
public class EmailTrackingPixelHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(EmailTrackingPixelHandler.class);

    private static final Buffer PIXEL_GIF = Buffer.buffer(new byte[] {
        71, 73, 70, 56, 57, 97,
        1, 0, 1, 0,
        (byte) 0x80, 0, 0,
        0, 0, 0,
        (byte) 0xff, (byte) 0xff, (byte) 0xff,
        33, (byte) 0xf9, 4, 1, 0, 0, 0, 0,
        44, 0, 0, 0, 0, 1, 0, 1, 0, 0,
        2, 2, 68, 1, 0,
        59
    });

    private final EmailTrackingPixelService service;

    public EmailTrackingPixelHandler(EmailTrackingPixelService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();

        if ("GET".equals(method) && path.endsWith("/pixel.gif")) {
            handlePixel(ctx);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            handleStats(ctx);
        } else if ("POST".equals(method) && path.endsWith("/reset")) {
            handleReset(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handlePixel(RoutingContext ctx) {
        String uid = sanitize(ctx.request().getParam("uid"), 64);
        if (uid == null) {
            sendError(ctx, 400, "uid required");
            return;
        }

        String campaignId = coalesce(
            sanitize(ctx.request().getParam("campaign"), 64),
            "spring-demo"
        );
        String recipient = coalesce(
            sanitize(ctx.request().getParam("recipient"), 120),
            "reader@example.com"
        );
        String mailbox = coalesce(
            sanitize(ctx.request().getParam("mailbox"), 32),
            "unknown"
        );
        String mode = coalesce(
            sanitize(ctx.request().getParam("mode"), 32),
            "direct"
        );
        String pixelId = coalesce(
            sanitize(ctx.request().getParam("pixel"), 96),
            uid + "-" + campaignId
        );

        String sourceIp = extractClientIp(ctx);
        String userAgent = sanitize(ctx.request().getHeader("User-Agent"), 200);

        service.recordOpen(uid, campaignId, recipient, mailbox, mode, pixelId, sourceIp, userAgent)
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "image/gif")
                .putHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                .putHeader("Pragma", "no-cache")
                .putHeader("Expires", "0")
                .putHeader("X-Tracking-Event-Id", String.valueOf(data.getLong("eventId")))
                .end(PIXEL_GIF))
            .onFailure(err -> {
                log.error("email tracking pixel error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleStats(RoutingContext ctx) {
        service.stats()
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("email tracking stats error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    private void handleReset(RoutingContext ctx) {
        service.reset()
            .onSuccess(data -> ctx.response()
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("status", 200).put("data", data).encode()))
            .onFailure(err -> {
                log.error("email tracking reset error", err);
                sendError(ctx, 500, "Internal error");
            });
    }

    protected String sanitize(String value, int maxLen) {
        if (value == null) return null;
        String cleaned = value.trim();
        if (cleaned.isEmpty()) return null;
        return cleaned.length() > maxLen ? cleaned.substring(0, maxLen) : cleaned;
    }

    private String extractClientIp(RoutingContext ctx) {
        String forwarded = ctx.request().getHeader("CF-Connecting-IP");
        if (forwarded == null) forwarded = ctx.request().getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        if (ctx.request().remoteAddress() != null) {
            return ctx.request().remoteAddress().host();
        }
        return "127.0.0.1";
    }

    private String coalesce(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("message", message).encode());
    }
}
