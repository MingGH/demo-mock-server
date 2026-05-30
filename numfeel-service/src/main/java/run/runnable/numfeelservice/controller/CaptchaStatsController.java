package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.CaptchaSubmitRequest;
import run.runnable.numfeelservice.service.CaptchaStatsService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * CAPTCHA 攻防实验室 HTTP 处理器。
 * POST /captcha/submit  — 提交挑战结果
 * GET  /captcha/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/captcha")
public class CaptchaStatsController {

    private static final Logger log = LoggerFactory.getLogger(CaptchaStatsController.class);

    private final CaptchaStatsService service;

    public CaptchaStatsController(CaptchaStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) CaptchaSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer passedCount = request.passedCount();
        Integer totalTimeMs = request.totalTimeMs();
        String grade = request.grade();
        Object levels = request.levels();

        if (passedCount == null || passedCount < 0 || passedCount > 8) {
            throw ApiException.badRequest("invalid passedCount");
        }
        if (totalTimeMs == null || totalTimeMs < 0 || totalTimeMs > 600000) {
            throw ApiException.badRequest("invalid totalTimeMs");
        }
        if (grade == null || grade.isBlank() || grade.length() > 4) {
            throw ApiException.badRequest("invalid grade");
        }
        if (levels == null) {
            throw ApiException.badRequest("missing levels");
        }

        return service.submit(request)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("captcha submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("captcha stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
