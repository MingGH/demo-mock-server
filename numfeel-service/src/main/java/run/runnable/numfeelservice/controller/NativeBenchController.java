package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.NativeBenchService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

/**
 * 跨界收费站 HTTP 处理器。
 * <p>
 * GET  /jni-boundary/status — native 库可用性与运行环境
 * POST /jni-boundary/run    — 在指定车道上跑一轮真实基准
 *                             body: { "lane": "java|native-percall|native-batch|noop", "count": 1000000 }
 * POST /jni-boundary/curve  — 逐档实测攒批曲线（每档批量都是真测量值）
 *                             body: { "count": 1000000 }
 */
@RestController
@RequestMapping("/jni-boundary")
public class NativeBenchController {

    private static final Logger log = LoggerFactory.getLogger(NativeBenchController.class);

    private final NativeBenchService service;

    public NativeBenchController(NativeBenchService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public ResponseEntity<JsonNode> status() {
        return ApiResponse.ok(service.status());
    }

    @PostMapping("/run")
    public Mono<ResponseEntity<JsonNode>> run(@RequestBody(required = false) Map<String, Object> body) {
        String lane = extractString(body, "lane", "java");
        int count = extractInt(body, "count", 1_000_000);

        if (!NativeBenchService.LANES.contains(lane)) {
            throw ApiException.badRequest("lane must be one of " + NativeBenchService.LANES);
        }
        if (count < 1 || count > NativeBenchService.MAX_COUNT) {
            throw ApiException.badRequest("count must be between 1 and " + NativeBenchService.MAX_COUNT);
        }
        return runGuarded(() -> service.run(lane, count).map(ApiResponse::ok));
    }

    @PostMapping("/curve")
    public Mono<ResponseEntity<JsonNode>> curve(@RequestBody(required = false) Map<String, Object> body) {
        int count = extractInt(body, "count", 1_000_000);
        if (count < 1 || count > NativeBenchService.MAX_COUNT) {
            throw ApiException.badRequest("count must be between 1 and " + NativeBenchService.MAX_COUNT);
        }
        return runGuarded(() -> service.runCurve(count).map(ApiResponse::ok));
    }

    /** 共用闸门：许可在订阅前同步获取，doFinally 释放，异常统一 500 */
    private Mono<ResponseEntity<JsonNode>> runGuarded(
            java.util.function.Supplier<Mono<ResponseEntity<JsonNode>>> task) {
        if (!service.tryAcquirePermit()) {
            throw new ApiException(503, "a benchmark is already running, please retry in a few seconds");
        }
        return task.get()
                .map(x -> (ResponseEntity<JsonNode>) x)
                .onErrorResume(err -> {
                    log.error("jni-boundary benchmark error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                })
                .doFinally(signal -> service.releasePermit());
    }

    private String extractString(Map<String, Object> body, String key, String defaultValue) {
        if (body == null || body.get(key) == null) {
            return defaultValue;
        }
        Object value = body.get(key);
        if (value instanceof String s && !s.isBlank()) {
            return s;
        }
        throw ApiException.badRequest(key + " must be a string");
    }

    private int extractInt(Map<String, Object> body, String key, int defaultValue) {
        if (body == null || body.get(key) == null) {
            return defaultValue;
        }
        Object value = body.get(key);
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(key + " must be an integer");
        }
    }
}
