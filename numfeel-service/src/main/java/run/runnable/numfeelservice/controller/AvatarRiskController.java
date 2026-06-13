package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 头像URL陷阱 演示后端。
 * <p>
 * POST /avatar-risk/track — 记录前端demo的交互事件（纯统计用途）
 * GET  /avatar-risk/stats  — 返回累计统计数据
 * POST /avatar-risk/check-url — 模拟后端对头像URL的安全校验
 */
@RestController
@RequestMapping("/avatar-risk")
public class AvatarRiskController {

    private static final Logger log = LoggerFactory.getLogger(AvatarRiskController.class);

    private final AtomicLong trackCount = new AtomicLong(0);
    private final ConcurrentHashMap<String, AtomicLong> actionCounts = new ConcurrentHashMap<>();

    @PostMapping("/track")
    public Mono<ResponseEntity<Map<String, Object>>> track(
            @RequestBody Map<String, Object> body,
            ServerWebExchange exchange) {
        String action = body.getOrDefault("action", "unknown").toString();
        trackCount.incrementAndGet();
        actionCounts.computeIfAbsent(action, k -> new AtomicLong(0)).incrementAndGet();

        String ip = extractIp(exchange);
        String ua = exchange.getRequest().getHeaders().getFirst("User-Agent");
        String referer = exchange.getRequest().getHeaders().getFirst("Referer");
        String lang = exchange.getRequest().getHeaders().getFirst("Accept-Language");
        log.debug("Avatar risk demo track: action={}, ip={}", action, ip);

        Map<String, Object> response = new ConcurrentHashMap<>();
        response.put("status", 200);
        response.put("recorded", true);
        response.put("totalViews", trackCount.get());
        // 把真实采集到的信息回传给前端，用于演示
        response.put("capturedIp", ip);
        response.put("capturedUa", ua != null ? ua : "unknown");
        response.put("capturedReferer", referer != null ? referer : "(无 Referer)");
        response.put("capturedLang", lang != null ? lang.split(",")[0] : "unknown");
        response.put("capturedTime", Instant.now().toString());
        return Mono.just(ResponseEntity.ok(response));
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<Map<String, Object>>> stats() {
        Map<String, Long> counts = new ConcurrentHashMap<>();
        actionCounts.forEach((k, v) -> counts.put(k, v.get()));
        return Mono.just(ResponseEntity.ok(Map.of(
                "status", 200,
                "totalEvents", trackCount.get(),
                "actions", counts,
                "since", Instant.now().toString()
        )));
    }

    /**
     * 模拟后端对用户提供的头像 URL 做安全校验。
     * 实际不发出请求，仅演示校验逻辑和结果。
     */
    @PostMapping("/check-url")
    public Mono<ResponseEntity<Map<String, Object>>> checkUrl(@RequestBody Map<String, String> body) {
        String url = body.getOrDefault("url", "");
        if (url.isBlank()) {
            return Mono.just(ResponseEntity.badRequest().body(Map.of(
                    "status", 400, "error", "url 不能为空")));
        }

        // 校验逻辑
        boolean isHttps = url.startsWith("https://");
        boolean isPrivateIp = isPrivateNetwork(url);
        boolean isMetadata = url.contains("169.254.169.254") || url.contains("metadata");
        boolean isSvg = url.toLowerCase().endsWith(".svg");
        boolean hasQueryParams = url.contains("?");

        Map<String, Object> result = new ConcurrentHashMap<>();
        result.put("status", 200);
        result.put("url", url);
        result.put("checks", Map.of(
                "https", isHttps,
                "privateIp", isPrivateIp,
                "metadataEndpoint", isMetadata,
                "svgFormat", isSvg,
                "queryParams", hasQueryParams
        ));

        boolean safe = isHttps && !isPrivateIp && !isMetadata && !isSvg;
        result.put("safe", safe);
        result.put("recommendation", safe
                ? "URL 通过基本校验，建议下载后做 magic bytes 验证"
                : "URL 存在安全风险，建议拒绝");

        return Mono.just(ResponseEntity.ok(result));
    }

    private boolean isPrivateNetwork(String url) {
        return url.contains("192.168.") || url.contains("10.")
                || url.contains("172.16.") || url.contains("172.17.")
                || url.contains("172.18.") || url.contains("172.19.")
                || url.contains("172.2") || url.contains("172.3")
                || url.contains("127.0.0.1") || url.contains("localhost")
                || url.contains("[::1]");
    }

    private String extractIp(ServerWebExchange exchange) {
        String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        var remoteAddress = exchange.getRequest().getRemoteAddress();
        return remoteAddress != null ? remoteAddress.getAddress().getHostAddress() : "unknown";
    }
}
