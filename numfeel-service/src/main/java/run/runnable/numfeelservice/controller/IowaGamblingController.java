package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.IowaGamblingSubmitRequest;
import run.runnable.numfeelservice.service.IowaGamblingService;
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
 * 爱荷华赌博任务 HTTP 处理器。
 * POST /iowa-gambling/submit — 提交完整牌局结果
 * GET  /iowa-gambling/stats  — 查询全站统计
 */
@RestController
@RequestMapping("/iowa-gambling")
public class IowaGamblingController {

    private static final Logger log = LoggerFactory.getLogger(IowaGamblingController.class);

    private final IowaGamblingService service;

    public IowaGamblingController(IowaGamblingService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) IowaGamblingSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        if (request.sessionId() == null || request.totalRounds() == null
                || request.finalMoney() == null || request.netScore() == null
                || request.bankrupt() == null
                || request.deckPicks() == null || request.blockScores() == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (request.sessionId().length() > 36 || request.sessionId().length() < 1) {
            throw ApiException.badRequest("Invalid sessionId");
        }
        if (request.totalRounds() < 1 || request.totalRounds() > 100) {
            throw ApiException.badRequest("Invalid totalRounds");
        }
        if (request.netScore() < -100 || request.netScore() > 100) {
            throw ApiException.badRequest("Invalid netScore");
        }
        if (request.finalMoney() < -1000000 || request.finalMoney() > 1000000) {
            throw ApiException.badRequest("Invalid finalMoney");
        }
        if (request.deckPicks().length() > 64 || request.blockScores().length() > 128) {
            throw ApiException.badRequest("Invalid picks or blockScores length");
        }

        return service.submit(
                        request.sessionId(),
                        request.totalRounds(),
                        request.finalMoney(),
                        request.netScore(),
                        request.bankrupt(),
                        request.deckPicks(),
                        request.blockScores())
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("iowa-gambling submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("iowa-gambling stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
