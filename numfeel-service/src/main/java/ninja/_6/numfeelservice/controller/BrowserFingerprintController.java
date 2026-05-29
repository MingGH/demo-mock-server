package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.FingerprintRecord;
import ninja._6.numfeelservice.service.FingerprintService;
import ninja._6.numfeelservice.web.ApiException;
import ninja._6.numfeelservice.web.ApiResponse;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 浏览器指纹 HTTP 处理器。
 * POST /fingerprint/collect — 采集指纹
 * GET  /fingerprint/stats   — 全站统计
 */
@RestController
@RequestMapping("/fingerprint")
public class BrowserFingerprintController {

    private static final Logger log = LoggerFactory.getLogger(BrowserFingerprintController.class);

    private final FingerprintService service;

    public BrowserFingerprintController(FingerprintService service) {
        this.service = service;
    }

    @PostMapping("/collect")
    public Mono<ResponseEntity<JsonNode>> collect(@RequestBody(required = false) JsonNode body,
                                                  ServerHttpRequest request) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String fullHash = sanitize(Json.getString(body, "fullHash"), 64);
        if (fullHash == null || fullHash.isEmpty()) {
            throw ApiException.badRequest("fullHash required");
        }

        String ipHint = request.getHeaders().getFirst("CF-Connecting-IP");
        if (ipHint == null) ipHint = request.getHeaders().getFirst("X-Forwarded-For");
        if (ipHint != null) ipHint = ipHint.split(",")[0].trim();
        if (ipHint == null && request.getRemoteAddress() != null
                && request.getRemoteAddress().getAddress() != null) {
            ipHint = request.getRemoteAddress().getAddress().getHostAddress();
        }

        FingerprintRecord record = FingerprintRecord.of(
                fullHash,
                sanitize(Json.getString(body, "canvasHash"), 64),
                sanitize(Json.getString(body, "fontHash"), 64),
                sanitize(Json.getString(body, "webglHash"), 64),
                sanitize(Json.getString(body, "screenInfo"), 128),
                sanitize(Json.getString(body, "timezone"), 64),
                sanitize(Json.getString(body, "language"), 32),
                sanitize(Json.getString(body, "platform"), 64),
                clampInt(Json.getInteger(body, "hardwareConcurrency"), 1, 256),
                clampInt(Json.getInteger(body, "deviceMemory"), 0, 128),
                Boolean.TRUE.equals(Json.getBoolean(body, "touchSupport")),
                clampInt(Json.getInteger(body, "colorDepth"), 1, 64),
                clampDouble(Json.getDouble(body, "pixelRatio"), 0.5, 10.0),
                clampDouble(Json.getDouble(body, "entropyBits"), 0.0, 64.0),
                sanitize(ipHint, 64)
        );

        return service.collect(record)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("Collect handler error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("Stats handler error", err);
                    return Mono.just(ApiResponse.error(500, "DB error"));
                });
    }

    // ── 输入清洗工具（protected 供测试访问） ──────────────────────────────
    protected String sanitize(String val, int maxLen) {
        if (val == null) return null;
        val = val.trim();
        if (val.isEmpty()) return null;
        return val.length() > maxLen ? val.substring(0, maxLen) : val;
    }

    protected Integer clampInt(Integer val, int min, int max) {
        if (val == null) return null;
        return Math.max(min, Math.min(max, val));
    }

    protected Double clampDouble(Double val, double min, double max) {
        if (val == null) return null;
        return Math.max(min, Math.min(max, val));
    }
}
