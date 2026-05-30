package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.MonkeySubmitRequest;
import run.runnable.numfeelservice.service.MonkeyStatsService;
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
 * 无限猴子打字机统计 HTTP 处理器。
 * POST /monkey/submit  — 提交模拟结果
 * GET  /monkey/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/monkey")
public class MonkeyStatsController {

    private static final Logger log = LoggerFactory.getLogger(MonkeyStatsController.class);

    private final MonkeyStatsService service;

    public MonkeyStatsController(MonkeyStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) MonkeySubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String targetText = request.targetText() == null ? "" : request.targetText().trim().toLowerCase();
        Integer targetLength = request.targetLength();
        Long totalAttempts = request.totalAttempts();
        Long totalChars = request.totalChars();
        Boolean success = request.success();
        Integer timeElapsed = request.timeElapsed();

        if (targetText.isEmpty() || targetLength == null || totalAttempts == null ||
                totalChars == null || success == null || timeElapsed == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (targetLength < 1 || targetLength > 12) {
            throw ApiException.badRequest("Invalid targetLength");
        }
        if (totalAttempts < 0 || totalChars < 0) {
            throw ApiException.badRequest("Invalid counts");
        }

        return service.submit(targetText, targetLength, totalAttempts, totalChars, success, timeElapsed)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("monkey submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("monkey stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
