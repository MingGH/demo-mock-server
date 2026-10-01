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

import java.util.Map;

/**
 * 跨界收费站 HTTP 处理器。
 * <p>
 * GET  /jni-boundary/status — native 库可用性与运行环境
 * POST /jni-boundary/run    — 在指定车道上跑一轮真实基准
 *                             body: { "lane": "java|native-percall|native-batch|noop", "count": 1000000 }
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
        // 基准同一时刻只放行一个（许可在订阅前同步获取，doFinally 释放）
        if (!service.tryAcquirePermit()) {
            throw new ApiException(503, "a benchmark is already running, please retry in a few seconds");
        }

        return service.run(lane, count)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("jni-boundary run error", err);
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
