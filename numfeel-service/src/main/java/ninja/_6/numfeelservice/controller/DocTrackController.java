package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 文档追踪像素处理器。
 * GET /doc-track/pixel?id=xxx   — 返回 1×1 透明 PNG，记录打开事件
 * GET /doc-track/events?id=xxx  — 返回该 token 的所有打开记录
 */
@RestController
@RequestMapping("/doc-track")
public class DocTrackController {

    private static final Logger log = LoggerFactory.getLogger(DocTrackController.class);

    private static final byte[] TRANSPARENT_PNG = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, (byte) 0xC4,
            (byte) 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
            0x54, 0x78, (byte) 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, (byte) 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, (byte) 0xAE,
            0x42, 0x60, (byte) 0x82
    };

    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Asia/Shanghai"));

    private final Cache<String, CopyOnWriteArrayList<ObjectNode>> eventStore = Caffeine.newBuilder()
            .maximumSize(200)
            .expireAfterWrite(24, TimeUnit.HOURS)
            .build();

    @GetMapping("/pixel")
    public ResponseEntity<byte[]> pixel(@RequestParam(required = false) String id,
                                        ServerHttpRequest request) {
        if (id == null || id.isBlank() || id.length() > 64) {
            return pixelResponse();
        }

        String ip = request.getHeaders().getFirst("CF-Connecting-IP");
        if (ip == null) ip = request.getHeaders().getFirst("X-Forwarded-For");
        if (ip != null) ip = ip.split(",")[0].trim();
        if (ip == null && request.getRemoteAddress() != null
                && request.getRemoteAddress().getAddress() != null) {
            ip = request.getRemoteAddress().getAddress().getHostAddress();
        }
        if (ip == null) ip = "unknown";

        String ua = request.getHeaders().getFirst("User-Agent");
        if (ua == null) ua = "unknown";
        if (ua.length() > 256) ua = ua.substring(0, 256);

        ObjectNode event = Json.obj();
        event.put("time", FMT.format(Instant.now()));
        event.put("ip", maskIp(ip));
        event.put("rawIp", ip);
        event.put("ua", ua);
        event.put("device", parseDevice(ua));
        event.put("os", parseOs(ua));

        CopyOnWriteArrayList<ObjectNode> list = eventStore.get(id, k -> new CopyOnWriteArrayList<>());
        if (list.size() < 50) {
            list.add(event);
        }

        log.info("doc-track pixel: id={} ip={} ua={}", id, maskIp(ip),
                ua.substring(0, Math.min(60, ua.length())));

        return pixelResponse();
    }

    @GetMapping(value = "/events", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> events(@RequestParam(required = false) String id) {
        if (id == null || id.isBlank() || id.length() > 64) {
            ObjectNode err = Json.obj();
            err.put("error", "missing id");
            return ResponseEntity.status(400).contentType(MediaType.APPLICATION_JSON).body(err);
        }

        CopyOnWriteArrayList<ObjectNode> list = eventStore.getIfPresent(id);
        ArrayNode arr = Json.arr();
        if (list != null) {
            for (ObjectNode ev : list) {
                ObjectNode o = Json.obj();
                o.put("time", ev.get("time").asText());
                o.put("ip", ev.get("ip").asText());
                o.put("ua", ev.get("ua").asText());
                o.put("device", ev.get("device").asText());
                o.put("os", ev.get("os").asText());
                arr.add(o);
            }
        }
        ObjectNode body = Json.obj();
        body.set("events", arr);
        body.put("count", arr.size());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private ResponseEntity<byte[]> pixelResponse() {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                .header("Pragma", "no-cache")
                .header("Expires", "0")
                .body(TRANSPARENT_PNG);
    }

    // 打码：保留前两段，后两段打码（例：123.45.67.89 → 123.45.*.*）
    static String maskIp(String ip) {
        if (ip == null || ip.equals("unknown")) return "unknown";
        if (ip.contains(":")) {
            int idx = ip.indexOf(":");
            int idx2 = ip.indexOf(":", idx + 1);
            if (idx2 > 0) return ip.substring(0, idx2) + ":****:****:****";
            return ip.substring(0, idx) + ":****";
        }
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
            Matcher m = Pattern.compile("iphone os ([\\d_]+)").matcher(u);
            if (m.find()) return "iOS " + m.group(1).replace("_", ".");
            return "iOS";
        }
        if (u.contains("mac os x")) {
            Matcher m = Pattern.compile("mac os x ([\\d_]+)").matcher(u);
            if (m.find()) return "macOS " + m.group(1).replace("_", ".");
            return "macOS";
        }
        if (u.contains("android")) {
            Matcher m = Pattern.compile("android ([\\d.]+)").matcher(u);
            if (m.find()) return "Android " + m.group(1);
            return "Android";
        }
        if (u.contains("linux")) return "Linux";
        return "未知系统";
    }
}
