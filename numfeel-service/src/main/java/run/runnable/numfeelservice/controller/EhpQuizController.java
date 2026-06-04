package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.EhpQuizSubmitRequest;
import run.runnable.numfeelservice.service.EhpQuizService;
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
 * EHP 词条对比直觉测试 HTTP 处理器。
 * POST /ehp-quiz/submit  — 提交答题结果
 * GET  /ehp-quiz/stats   — 查询统计数据
 */
@RestController
@RequestMapping("/ehp-quiz")
public class EhpQuizController {

    private static final Logger log = LoggerFactory.getLogger(EhpQuizController.class);

    private final EhpQuizService service;

    public EhpQuizController(EhpQuizService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) EhpQuizSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer total = request.totalQuestions();
        Integer correct = request.correctCount();
        if (total == null || total < 1 || total > 10) {
            throw ApiException.badRequest("invalid totalQuestions");
        }
        if (correct == null || correct < 0 || correct > total) {
            throw ApiException.badRequest("invalid correctCount");
        }
        // 允许 null 的布尔值视为 false
        boolean q1 = Boolean.TRUE.equals(request.q1Correct());
        boolean q2 = Boolean.TRUE.equals(request.q2Correct());
        boolean q3 = Boolean.TRUE.equals(request.q3Correct());
        boolean q4 = Boolean.TRUE.equals(request.q4Correct());
        boolean q5 = Boolean.TRUE.equals(request.q5Correct());

        return service.submit(total, correct, q1, q2, q3, q4, q5)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("ehp-quiz submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("ehp-quiz stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
