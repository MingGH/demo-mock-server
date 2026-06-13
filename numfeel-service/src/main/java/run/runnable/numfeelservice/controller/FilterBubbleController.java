package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.FilterBubbleSubmitRequest;
import run.runnable.numfeelservice.service.FilterBubbleService;
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
 * 信息茧房模拟器 HTTP 处理器。
 * POST /filter-bubble/submit — 提交实验结果
 * GET  /filter-bubble/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/filter-bubble")
public class FilterBubbleController {

    private static final Logger log = LoggerFactory.getLogger(FilterBubbleController.class);

    private final FilterBubbleService service;

    public FilterBubbleController(FilterBubbleService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) FilterBubbleSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        if (request.entropyDrop() == null || request.dominantCat() == null || request.dominantPct() == null
                || request.totalRounds() == null || request.clickSequence() == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (request.totalRounds() < 1 || request.totalRounds() > 200) {
            throw ApiException.badRequest("Invalid totalRounds");
        }

        int convergeRound = request.convergeRound() != null ? request.convergeRound() : -1;

        return service.submit(
                        request.entropyDrop(),
                        request.dominantCat(),
                        request.dominantPct(),
                        convergeRound,
                        request.totalRounds(),
                        request.clickSequence())
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("filter-bubble submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("filter-bubble stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
