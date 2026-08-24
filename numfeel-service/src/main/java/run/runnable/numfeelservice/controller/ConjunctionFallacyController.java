package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayRequests.ConjunctionFallacySubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyStatsResponse;
import run.runnable.numfeelservice.service.ConjunctionFallacyService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import run.runnable.numfeelservice.web.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 合取谬误（Conjunction Fallacy）测试 HTTP 处理器。
 * POST /conjunction-fallacy/submit  — 提交测试结果
 * GET  /conjunction-fallacy/stats   — 查询全站统计
 */
@RestController
@RequestMapping("/conjunction-fallacy")
public class ConjunctionFallacyController {

    private final ConjunctionFallacyService service;

    public ConjunctionFallacyController(ConjunctionFallacyService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ApiEnvelope<ConjunctionFallacyStatsResponse>> submit(
            @RequestBody(required = false) ConjunctionFallacySubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer total = request.totalQuestions();
        Integer correct = request.correctCount();
        String sessionId = request.sessionId();
        String answers = request.answers();
        if (sessionId == null || sessionId.isBlank() || sessionId.length() > 36) {
            throw ApiException.badRequest("Invalid sessionId");
        }
        if (total == null || total != ConjunctionFallacyService.QUESTION_COUNT) {
            throw ApiException.badRequest("Invalid totalQuestions");
        }
        if (correct == null || correct < 0 || correct > total) {
            throw ApiException.badRequest("Invalid correctCount");
        }
        if (answers == null || answers.length() < ConjunctionFallacyService.QUESTION_COUNT * 2 - 1
                || answers.length() > ConjunctionFallacyService.QUESTION_COUNT * 4) {
            throw ApiException.badRequest("Invalid answers");
        }

        return service.submit(sessionId, total, correct, answers)
                .map(ApiEnvelope::ok);
    }

    @GetMapping("/stats")
    public Mono<ApiEnvelope<ConjunctionFallacyStatsResponse>> stats() {
        return service.stats()
                .map(ApiEnvelope::ok);
    }
}