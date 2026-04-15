package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Handler;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.Cookie;
import io.vertx.core.http.CookieSameSite;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Favicon Supercookie 处理器。
 *
 * GET  /supercookie/launch       → launch 页面，通过 launch favicon 判断读/写
 * GET  /supercookie/launch-icon  → launch favicon，首次请求时发放写入 token
 * GET  /supercookie/write        → 创建 WRITE 会话并跳到首个 bit 页面
 * GET  /supercookie/read         → 创建 READ 会话并跳到首个 bit 页面
 * GET  /supercookie/finalize     → 汇总结果并跳回主页面
 * GET  /supercookie/step         → 在 bit 子域名上加载读/写共用 worker 页
 * GET  /favicon.ico              → 真正的 favicon 入口（bit 子域名）
 * GET  /supercookie/stats        → 统计
 */
public class SupercookieHandler implements Handler<RoutingContext> {
    private static final Pattern BIT_HOST_PATTERN = Pattern.compile("^bit(\\d+)-numfeel\\.996\\.ninja$");
    private static final String API_BASE = "https://numfeel-api.996.ninja";
    private static final String DEFAULT_RETURN_TO = "https://numfeel.996.ninja/pages/favicon-supercookie/";
    private static final String ACTION_PARAM = "sc_action";
    private static final String MODE_WRITE = "WRITE";
    private static final String LAUNCH_COOKIE = "sc_mid";
    private static final String SESSION_COOKIE = "sc_uid";
    private static final int PAGE_REDIRECT_DELAY_MS = 700;
    private static final long SESSION_COOKIE_MAX_AGE_SECONDS = 5 * 60L;
    private static final long LAUNCH_COOKIE_MAX_AGE_SECONDS = 2 * 60L;

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

        if ("GET".equals(method) && path.endsWith("/launch")) {
            sendHtml(ctx, renderLaunchPage(sanitizeReturnTo(ctx.request().getParam("returnTo"))));
        } else if ("GET".equals(method) && path.endsWith("/launch-icon")) {
            setCookie(ctx, LAUNCH_COOKIE, service.issueWriteToken(), LAUNCH_COOKIE_MAX_AGE_SECONDS, false);
            sendFavicon(ctx, true);
        } else if ("GET".equals(method) && path.endsWith("/write")) {
            String token = firstNonBlank(ctx.request().getParam("mid"), cookieValue(ctx, LAUNCH_COOKIE));
            clearCookie(ctx, LAUNCH_COOKIE, false);
            JsonObject data = service.beginWriteFlow(token);
            if (data == null) {
                redirect(ctx, API_BASE + "/supercookie/launch?returnTo=" + encode(sanitizeReturnTo(ctx.request().getParam("returnTo"))));
                return;
            }

            String uid = data.getString("uid");
            int firstBitIndex = data.getInteger("firstBitIndex", -1);
            String returnTo = sanitizeReturnTo(ctx.request().getParam("returnTo"));
            setCookie(ctx, SESSION_COOKIE, uid, SESSION_COOKIE_MAX_AGE_SECONDS, true);

            if (firstBitIndex < 0) {
                redirect(ctx, buildFinalizeUrl(returnTo));
                return;
            }
            redirect(ctx, stepPageUrl(firstBitIndex, returnTo));
        } else if ("GET".equals(method) && path.endsWith("/read")) {
            JsonObject data = service.beginReadFlow();
            String uid = data.getString("uid");
            String returnTo = sanitizeReturnTo(ctx.request().getParam("returnTo"));
            setCookie(ctx, SESSION_COOKIE, uid, SESSION_COOKIE_MAX_AGE_SECONDS, true);
            redirect(ctx, stepPageUrl(0, returnTo));
        } else if ("GET".equals(method) && path.endsWith("/finalize")) {
            String uid = cookieValue(ctx, SESSION_COOKIE);
            String returnTo = sanitizeReturnTo(ctx.request().getParam("returnTo"));
            JsonObject result = service.finalizeSession(uid);
            clearCookie(ctx, SESSION_COOKIE, true);
            redirect(ctx, buildReturnUrl(returnTo, result));
        } else if ("GET".equals(method) && (path.endsWith("/step") || path.endsWith("/write-page") || path.endsWith("/read-page"))) {
            if (bitIndex == null) {
                ctx.response().setStatusCode(400).end("step page must be loaded on bit subdomain");
                return;
            }
            String uid = cookieValue(ctx, SESSION_COOKIE);
            SupercookieService.SessionMode mode = service.getSessionMode(uid);
            JsonObject data = service.registerStepVisit(uid, bitIndex, host);
            if (data == null) {
                ctx.response().setStatusCode(400).end("invalid step session");
                return;
            }
            String returnTo = sanitizeReturnTo(ctx.request().getParam("returnTo"));
            String nextUrl = mode == SupercookieService.SessionMode.WRITE
                    ? buildNextWriteUrl(data, returnTo)
                    : buildNextReadUrl(data, returnTo);
            sendHtml(ctx, renderWorkerPage(mode == SupercookieService.SessionMode.WRITE ? "write" : "read", bitIndex, nextUrl));
        } else if ("GET".equals(method) && "/favicon.ico".equals(path)) {
            if (bitIndex == null) {
                ctx.next();
                return;
            }
            String uid = cookieValue(ctx, SESSION_COOKIE);
            SupercookieService.FaviconDecision decision = service.handleFaviconRequest(uid, host, bitIndex);
            sendFavicon(ctx, decision == SupercookieService.FaviconDecision.CACHEABLE);
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
            response.end(Buffer.buffer(FAVICON_BYTES));
        } else {
            response
                    .setStatusCode(404)
                    .putHeader("Cache-Control", "no-store, max-age=0")
                    .putHeader("Pragma", "no-cache")
                    .putHeader("Expires", "0")
                    .putHeader("X-Robots-Tag", "noindex");
            response.end();
        }
    }

    private void redirect(RoutingContext ctx, String url) {
        ctx.response()
                .setStatusCode(302)
                .putHeader("Location", url)
                .end();
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

    private static String sanitizeReturnTo(String returnTo) {
        if (returnTo == null || returnTo.isBlank()) return DEFAULT_RETURN_TO;
        if (returnTo.startsWith("https://numfeel.996.ninja/")) return returnTo;
        if (returnTo.startsWith("http://localhost")) return returnTo;
        if (returnTo.startsWith("https://localhost")) return returnTo;
        return DEFAULT_RETURN_TO;
    }

    private void setCookie(RoutingContext ctx, String name, String value, long maxAgeSeconds, boolean sharedAcrossSubdomains) {
        Cookie cookie = Cookie.cookie(name, value)
                .setPath("/")
                .setHttpOnly(false)
                .setMaxAge(maxAgeSeconds)
                .setSameSite(CookieSameSite.LAX);

        String domain = sharedAcrossSubdomains ? sharedCookieDomain(ctx.request().host()) : null;
        if (domain != null) {
            cookie.setDomain(domain);
        }
        if (isSecureHost(ctx.request().host())) {
            cookie.setSecure(true);
        }
        ctx.addCookie(cookie);
    }

    private void clearCookie(RoutingContext ctx, String name, boolean sharedAcrossSubdomains) {
        setCookie(ctx, name, "", 0, sharedAcrossSubdomains);
    }

    private static String cookieValue(RoutingContext ctx, String name) {
        Cookie cookie = ctx.getCookie(name);
        return cookie != null ? cookie.getValue() : null;
    }

    private static String sharedCookieDomain(String host) {
        String normalizedHost = normalizeHost(host);
        if (normalizedHost.endsWith(".996.ninja") || Objects.equals(normalizedHost, "996.ninja")) {
            return "996.ninja";
        }
        return null;
    }

    private static boolean isSecureHost(String host) {
        String normalizedHost = normalizeHost(host);
        return normalizedHost.endsWith(".996.ninja") || Objects.equals(normalizedHost, "996.ninja");
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return b;
    }

    private static Integer bitIndexFromHost(String host) {
        Matcher matcher = BIT_HOST_PATTERN.matcher(host);
        if (!matcher.matches()) return null;
        return Integer.parseInt(matcher.group(1));
    }

    private static String renderLaunchPage(String returnTo) {
        String safeReturnTo = returnTo.replace("\\", "\\\\").replace("\"", "\\\"");
        return "<!DOCTYPE html>\n" +
                "<html lang=\"zh-CN\">\n" +
                "<head>\n" +
                "  <meta charset=\"UTF-8\">\n" +
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "  <meta http-equiv=\"Cache-Control\" content=\"no-store\">\n" +
                "  <link rel=\"icon\" href=\"/supercookie/launch-icon\">\n" +
                "  <link rel=\"shortcut icon\" href=\"/supercookie/launch-icon\">\n" +
                "  <title>F-Cache launch</title>\n" +
                "  <style>body{font-family:sans-serif;background:#111;color:#ddd;margin:0;padding:8px;font-size:12px}</style>\n" +
                "</head>\n" +
                "<body>\n" +
                "launch\n" +
                "<script>\n" +
                "window.addEventListener('load', function () {\n" +
                "  setTimeout(function () {\n" +
                "    var midMatch = document.cookie.match(/(?:^|; )sc_mid=([^;]+)/);\n" +
                "    var mid = midMatch ? decodeURIComponent(midMatch[1]) : '';\n" +
                "    var target = mid\n" +
                "      ? '/supercookie/write?mid=' + encodeURIComponent(mid) + '&returnTo=' + encodeURIComponent(\"" + safeReturnTo + "\")\n" +
                "      : '/supercookie/read?returnTo=' + encodeURIComponent(\"" + safeReturnTo + "\");\n" +
                "    window.location.replace(target);\n" +
                "  }, 500);\n" +
                "});\n" +
                "</script>\n" +
                "</body>\n" +
                "</html>\n";
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

    private static String buildNextWriteUrl(JsonObject data, String returnTo) {
        int nextBitIndex = data.getInteger("nextBitIndex", -1);
        if (nextBitIndex < 0) {
            return buildFinalizeUrl(returnTo);
        }
        return stepPageUrl(nextBitIndex, returnTo);
    }

    private static String buildNextReadUrl(JsonObject data, String returnTo) {
        int nextBitIndex = data.getInteger("nextBitIndex", -1);
        if (nextBitIndex < 0) {
            return buildFinalizeUrl(returnTo);
        }
        return stepPageUrl(nextBitIndex, returnTo);
    }

    private static String buildFinalizeUrl(String returnTo) {
        return API_BASE + "/supercookie/finalize?returnTo=" + encode(returnTo);
    }

    private static String stepPageUrl(int bitIndex, String returnTo) {
        return "https://bit" + bitIndex + "-numfeel.996.ninja/supercookie/step?returnTo=" + encode(returnTo);
    }

    private static String buildReturnUrl(String returnTo, JsonObject result) {
        String action;
        if (!result.getBoolean("complete", false) || result.getString("error") != null) {
            action = "error";
        } else if (MODE_WRITE.equals(result.getString("mode"))) {
            action = "written";
        } else {
            action = "read";
        }

        StringBuilder url = new StringBuilder(returnTo);
        url.append(returnTo.contains("?") ? "&" : "?");
        url.append(ACTION_PARAM).append("=").append(encode(action));

        if (result.getString("error") != null) {
            url.append("&reason=").append(encode(result.getString("error")));
            return url.toString();
        }

        if (!result.getBoolean("complete", false)) {
            url.append("&reason=").append(encode("flow incomplete"));
        }

        url.append("&trackingId=").append(encode(String.valueOf(result.getInteger("trackingId", 0))));
        url.append("&binary=").append(encode(result.getString("binary", "")));
        url.append("&mode=").append(encode(result.getString("mode", "")));
        url.append("&visitedCount=").append(encode(String.valueOf(result.getInteger("visitedCount", 0))));
        url.append("&expectedVisitedCount=").append(encode(String.valueOf(result.getInteger("expectedVisitedCount", 0))));
        url.append("&networkRequestCount=").append(encode(String.valueOf(result.getInteger("networkRequestCount", 0))));
        url.append("&allOne=").append(encode(String.valueOf(result.getBoolean("allOne", false))));
        url.append("&allZero=").append(encode(String.valueOf(result.getBoolean("allZero", false))));
        return url.toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
