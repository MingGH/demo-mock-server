package com.example.demo_mock_server.handler;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

/**
 * 文档追踪像素处理器
 *
 * GET /doc-track/pixel?id=xxx   — 返回 1×1 透明 PNG，记录打开事件
 * GET /doc-track/events?id=xxx  — 返回该 token 的所有打开记录（前端轮询）
 * POST /doc-track/token         — 生成新 token（可选，前端也可自己生成）
 */
public class DocTrackHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(DocTrackHandler.class);

    // 1×1 透明 PNG（44 字节）
    private static final byte[] TRANSPARENT_PNG = {
        (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, (byte)0xC4,
        (byte)0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, (byte)0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, (byte)0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte)0xAE,
        0x42, 0x60, (byte)0x82
    };

    private static final DateTimeFormatter FMT =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Asia/Shanghai"));

    // token → 事件列表，最多保留 200 个 token，每个 token 最多 50 条事件，24h 过期
    private final Cache<String, CopyOnWriteArrayList<JsonObject>> eventStore = Caffeine.newBuilder()
        .maximumSize(200)
        .expireAfterWrite(24, TimeUnit.HOURS)
        .build();

    @Override
    public void handle(RoutingContext ctx) {
        String path = ctx.request().path();
        String method = ctx.request().method().name();

        if (path.endsWith("/pixel") && "GET".equals(method)) {
            handlePixel(ctx);
        } else if (path.endsWith("/events") && "GET".equals(method)) {
            handleEvents(ctx);
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void handlePixel(RoutingContext ctx) {
        String id = ctx.request().getParam("id");
        if (id == null || id.isBlank() || id.length() > 64) {
            // 仍然返回像素，不暴露错误
            sendPixel(ctx);
            return;
        }

        // 提取 IP
        String ip = ctx.request().getHeader("CF-Connecting-IP");
        if (ip == null) ip = ctx.request().getHeader("X-Forwarded-For");
        if (ip != null) ip = ip.split(",")[0].trim();
        if (ip == null && ctx.request().remoteAddress() != null) {
            ip = ctx.request().remoteAddress().host();
        }
        if (ip == null) ip = "unknown";

        String ua = ctx.request().getHeader("User-Agent");
        if (ua == null) ua = "unknown";
        if (ua.length() > 256) ua = ua.substring(0, 256);

        String time = FMT.format(Instant.now());

        JsonObject event = new JsonObject()
            .put("time", time)
            .put("ip", maskIp(ip))
            .put("rawIp", ip)  // 内部用，不返回给前端
            .put("ua", ua)
            .put("device", parseDevice(ua))
            .put("os", parseOs(ua));

        CopyOnWriteArrayList<JsonObject> list = eventStore.get(id, k -> new CopyOnWriteArrayList<>());
        if (list.size() < 50) {
            list.add(event);
        }

        log.info("doc-track pixel: id={} ip={} ua={}", id, maskIp(ip), ua.substring(0, Math.min(60, ua.length())));

        sendPixel(ctx);
    }

    private void handleEvents(RoutingContext ctx) {
        String id = ctx.request().getParam("id");
        if (id == null || id.isBlank() || id.length() > 64) {
            sendJson(ctx, 400, new JsonObject().put("error", "missing id"));
            return;
        }

        CopyOnWriteArrayList<JsonObject> list = eventStore.getIfPresent(id);
        JsonArray arr = new JsonArray();
        if (list != null) {
            for (JsonObject ev : list) {
                // 返回给前端时去掉 rawIp
                arr.add(new JsonObject()
                    .put("time", ev.getString("time"))
                    .put("ip", ev.getString("ip"))
                    .put("ua", ev.getString("ua"))
                    .put("device", ev.getString("device"))
                    .put("os", ev.getString("os")));
            }
        }

        sendJson(ctx, 200, new JsonObject().put("events", arr).put("count", arr.size()));
    }

    private void sendPixel(RoutingContext ctx) {
        ctx.response()
            .putHeader("Content-Type", "image/png")
            .putHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            .putHeader("Pragma", "no-cache")
            .putHeader("Expires", "0")
            .end(io.vertx.core.buffer.Buffer.buffer(TRANSPARENT_PNG));
    }

    private void sendJson(RoutingContext ctx, int status, JsonObject body) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(body.encode());
    }

    // 打码：保留前两段，后两段打码
    // 例：123.45.67.89 → 123.45.*.*
    static String maskIp(String ip) {
        if (ip == null || ip.equals("unknown")) return "unknown";
        // IPv6
        if (ip.contains(":")) {
            int idx = ip.indexOf(":");
            int idx2 = ip.indexOf(":", idx + 1);
            if (idx2 > 0) return ip.substring(0, idx2) + ":****:****:****";
            return ip.substring(0, idx) + ":****";
        }
        // IPv4
        String[] parts = ip.split("\\.");
        if (parts.length == 4) {
            return parts[0] + "." + parts[1] + ".*.*";
        }
        return ip.substring(0, Math.min(4, ip.length())) + "***";
    }

    static String parseDevice(String ua) {
        if (ua == null) return "未知设备";
        String u = ua.toLowerCase();
        if (u.contains("iphone")) return "iPhone";
        if (u.contains("ipad")) return "iPad";
        if (u.contains("android") && u.contains("mobile")) return "Android 手机";
        if (u.contains("android")) return "Android 平板";
        if (u.contains("macintosh") || u.contains("mac os x")) return "Mac";
        if (u.contains("windows")) return "Windows PC";
        if (u.contains("linux")) return "Linux";
        return "未知设备";
    }

    static String parseOs(String ua) {
        if (ua == null) return "未知系统";
        String u = ua.toLowerCase();
        if (u.contains("windows nt 10")) return "Windows 10/11";
        if (u.contains("windows nt 6.3")) return "Windows 8.1";
        if (u.contains("windows nt 6.1")) return "Windows 7";
        if (u.contains("windows")) return "Windows";
        if (u.contains("iphone os")) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("iphone os ([\\d_]+)").matcher(u);
            if (m.find()) return "iOS " + m.group(1).replace("_", ".");
            return "iOS";
        }
        if (u.contains("mac os x")) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("mac os x ([\\d_]+)").matcher(u);
            if (m.find()) return "macOS " + m.group(1).replace("_", ".");
            return "macOS";
        }
        if (u.contains("android")) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("android ([\\d.]+)").matcher(u);
            if (m.find()) return "Android " + m.group(1);
            return "Android";
        }
        if (u.contains("linux")) return "Linux";
        return "未知系统";
    }
}
