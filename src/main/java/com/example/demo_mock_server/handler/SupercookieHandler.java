package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Handler;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Favicon Supercookie 处理器。
 *
 * POST /supercookie/session      → 分配 ID
 * POST /supercookie/probe/start  → 开始一次读取会话
 * POST /supercookie/probe/finish → 结束读取会话，返回恢复结果
 * GET  /supercookie/write-page   → 在 bit 子域名上加载写入页
 * GET  /supercookie/read-page    → 在 bit 子域名上加载读取页
 * GET  /favicon.ico              → 真正的 favicon 入口（bit 子域名）
 * GET  /supercookie/stats        → 统计
 */
public class SupercookieHandler implements Handler<RoutingContext> {
    private static final Pattern BIT_HOST_PATTERN = Pattern.compile("^bit(\\d+)-numfeel\\.996\\.ninja$");
    private static final int PAGE_REDIRECT_DELAY_MS = 700;

    private final SupercookieService service;

    private static final byte[] FAVICON_BYTES = {
        (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, (byte)0x90, 0x77, 0x53,
        (byte)0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, (byte)0xD7, 0x63, (byte)0xD8, (byte)0xAC, (byte)0xC5, 0x60,
        0x00, 0x00, 0x00, 0x21, 0x00, 0x01, (byte)0xE5, (byte)0xB0,
        (byte)0x4A, (byte)0x08, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, (byte)0xAE, 0x42, 0x60, (byte)0x82
    };

    public SupercookieHandler(SupercookieService service) {
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        String path = ctx.request().path();
        String host = normalizeHost(ctx.request().host());
        Integer bitIndex = bitIndexFromHost(host);

        if ("POST".equals(method) && path.endsWith("/session")) {
            sendJson(ctx, 200, service.createWriteSession());
        } else if ("POST".equals(method) && path.endsWith("/probe/start")) {
            sendJson(ctx, 200, service.startProbeSession());
        } else if ("POST".equals(method) && path.endsWith("/probe/finish")) {
            JsonObject body = ctx.body().asJsonObject();
            String probeId = body != null ? body.getString("probeId") : null;
            if (probeId == null || probeId.isBlank()) {
                ctx.response().setStatusCode(400).end("missing probeId");
                return;
            }
            sendJson(ctx, 200, service.finishProbeSession(probeId));
        } else if ("GET".equals(method) && path.endsWith("/write-page")) {
            if (bitIndex == null) {
                ctx.response().setStatusCode(400).end("write-page must be loaded on bit subdomain");
                return;
            }
            service.registerWritePageVisit(bitIndex, host);
            sendHtml(ctx, renderWorkerPage("write", bitIndex, buildNextWriteUrl(ctx, bitIndex)));
        } else if ("GET".equals(method) && path.endsWith("/read-page")) {
            if (bitIndex == null) {
                ctx.response().setStatusCode(400).end("read-page must be loaded on bit subdomain");
                return;
            }
            String probeId = ctx.request().getParam("probeId");
            if (probeId == null || probeId.isBlank()) {
                ctx.response().setStatusCode(400).end("missing probeId");
                return;
            }
            service.registerReadPageVisit(probeId, bitIndex, host);
            sendHtml(ctx, renderWorkerPage("read", bitIndex, buildNextReadUrl(ctx, bitIndex, probeId)));
        } else if ("GET".equals(method) && "/favicon.ico".equals(path)) {
            if (bitIndex == null) {
                ctx.next();
                return;
            }
            boolean cacheable = service.handleFaviconRequest(host);
            sendFavicon(ctx, cacheable);
        } else if ("GET".equals(method) && path.endsWith("/pixel")) {
            // 兼容旧版脚本；新方案不再依赖这个端点。
            sendFavicon(ctx, true);
        } else if ("GET".equals(method) && path.endsWith("/stats")) {
            sendJson(ctx, 200, service.stats());
        } else {
            ctx.response().setStatusCode(404).end();
        }
    }

    private void sendFavicon(RoutingContext ctx, boolean cacheable) {
        var response = ctx.response()
            .putHeader("Content-Type", "image/png")
            .putHeader("CDN-Cache-Control", "no-store")
            .putHeader("Access-Control-Allow-Origin", "*");

        if (cacheable) {
            response.putHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
            response
                    .putHeader("Cache-Control", "no-store, max-age=0")
                    .putHeader("Pragma", "no-cache")
                    .putHeader("Expires", "0");
        }

        response.end(Buffer.buffer(FAVICON_BYTES));
    }

    private void sendHtml(RoutingContext ctx, String html) {
        ctx.response()
            .putHeader("Content-Type", "text/html; charset=UTF-8")
            .putHeader("Cache-Control", "no-store, max-age=0")
            .putHeader("Pragma", "no-cache")
            .end(Buffer.buffer(html, StandardCharsets.UTF_8.name()));
    }

    private void sendJson(RoutingContext ctx, int status, JsonObject data) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject().put("status", status).put("data", data).encode());
    }

    private static String normalizeHost(String host) {
        if (host == null) return "";
        String normalized = host.toLowerCase();
        int colon = normalized.indexOf(':');
        return colon >= 0 ? normalized.substring(0, colon) : normalized;
    }

    private static Integer bitIndexFromHost(String host) {
        Matcher matcher = BIT_HOST_PATTERN.matcher(host);
        if (!matcher.matches()) return null;
        return Integer.parseInt(matcher.group(1));
    }

    private static String renderWorkerPage(String mode, int bitIndex, String nextUrl) {
        String safeNextUrl = nextUrl.replace("\\", "\\\\").replace("\"", "\\\"");
        return "<!DOCTYPE html>\n" +
                "<html lang=\"zh-CN\">\n" +
                "<head>\n" +
                "  <meta charset=\"UTF-8\">\n" +
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "  <meta http-equiv=\"Cache-Control\" content=\"no-store\">\n" +
                "  <link rel=\"icon\" href=\"/favicon.ico\">\n" +
                "  <link rel=\"shortcut icon\" href=\"/favicon.ico\">\n" +
                "  <title>F-Cache " + mode + " bit" + bitIndex + "</title>\n" +
                "  <style>body{font-family:sans-serif;background:#111;color:#ddd;margin:0;padding:8px;font-size:12px}</style>\n" +
                "</head>\n" +
                "<body>\n" +
                "bit" + bitIndex + " " + mode + "\n" +
                "<script>\n" +
                "console.log('[F-Cache info] " + mode + "-page bit" + bitIndex + " loaded');\n" +
                "window.addEventListener('load', function () {\n" +
                "  setTimeout(function () {\n" +
                "    window.location.replace(\"" + safeNextUrl + "\");\n" +
                "  }, " + PAGE_REDIRECT_DELAY_MS + ");\n" +
                "});\n" +
                "</script>\n" +
                "</body>\n" +
                "</html>\n";
    }

    private static String buildNextWriteUrl(RoutingContext ctx, int bitIndex) {
        String bits = ctx.request().getParam("bits");
        String returnTo = ctx.request().getParam("returnTo");
        if (bits == null || returnTo == null) return returnTo != null ? returnTo : "https://numfeel.996.ninja/pages/favicon-supercookie/";

        for (int i = bitIndex + 1; i < bits.length(); i++) {
            if (bits.charAt(i) == '1') {
                return "https://bit" + i + "-numfeel.996.ninja/supercookie/write-page?bits=" +
                        encode(bits) + "&returnTo=" + encode(returnTo);
            }
        }
        return returnTo;
    }

    private static String buildNextReadUrl(RoutingContext ctx, int bitIndex, String probeId) {
        String returnTo = ctx.request().getParam("returnTo");
        if (returnTo == null || returnTo.isBlank()) {
            returnTo = "https://numfeel.996.ninja/pages/favicon-supercookie/";
        }
        if (bitIndex >= SupercookieService.BITS - 1) {
            return returnTo;
        }
        int nextBit = bitIndex + 1;
        return "https://bit" + nextBit + "-numfeel.996.ninja/supercookie/read-page?probeId=" +
                encode(probeId) + "&returnTo=" + encode(returnTo);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
