package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.IowaGamblingLeaderboardSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.IowaGamblingSubmitRequest;
import run.runnable.numfeelservice.service.IowaGamblingService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 爱荷华赌博任务 HTTP 处理器。
 * POST /iowa-gambling/submit           — 提交完整牌局结果
 * GET  /iowa-gambling/stats            — 查询全站统计
 * GET  /iowa-gambling/leaderboard/challenge — 获取排行榜提交 PoW challenge
 * POST /iowa-gambling/leaderboard/submit-v2 — 提交排行榜成绩（防刷榜）
 * GET  /iowa-gambling/leaderboard      — 查询净分数排行榜
 */
@RestController
@RequestMapping("/iowa-gambling")
public class IowaGamblingController {

    private static final Logger log = LoggerFactory.getLogger(IowaGamblingController.class);

    private static final int MAX_USERNAME_LENGTH = 50;

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

    @GetMapping("/leaderboard")
    public Mono<ResponseEntity<JsonNode>> leaderboard(
            @RequestParam(defaultValue = "10") int limit) {
        return service.leaderboard(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("iowa-gambling leaderboard error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 获取排行榜提交的一次性 PoW challenge。
     */
    @GetMapping("/leaderboard/challenge")
    public Mono<ResponseEntity<JsonNode>> leaderboardChallenge() {
        return service.createLeaderboardChallenge()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("iowa-gambling leaderboard challenge error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 提交排行榜成绩（v2，防刷榜：Turnstile 人机验证 + PoW 工作量证明 + 提交冷却）。
     */
    @PostMapping("/leaderboard/submit-v2")
    public Mono<ResponseEntity<JsonNode>> submitLeaderboardV2(
            @RequestBody(required = false) IowaGamblingLeaderboardSubmitRequest request,
            ServerHttpRequest httpRequest) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String remoteIp = ClientIp.resolve(httpRequest);
        String username = normalizeUsername(request.username());
        if (username == null || username.isBlank()) {
            throw ApiException.badRequest("username is required");
        }
        if (username.length() > MAX_USERNAME_LENGTH) {
            throw ApiException.badRequest("username too long (max " + MAX_USERNAME_LENGTH + ")");
        }
        if (request.netScore() == null || request.finalMoney() == null
                || request.totalRounds() == null || request.bankrupt() == null
                || request.deckPicks() == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (request.challengeId() == null || request.powHash() == null || request.powNonce() == null) {
            throw ApiException.badRequest("challengeId/powHash/powNonce are required");
        }
        if (request.cfTurnstileToken() == null || request.cfTurnstileToken().isBlank()) {
            throw ApiException.badRequest("人机验证未通过，请先完成验证再提交");
        }

        return service.submitLeaderboard(
                        username,
                        request.netScore(),
                        request.finalMoney(),
                        request.bankrupt(),
                        request.totalRounds(),
                        request.deckPicks(),
                        request.challengeId(),
                        request.powHash(),
                        request.powNonce(),
                        request.cfTurnstileToken(),
                        remoteIp)
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class, err ->
                        Mono.just(ApiResponse.error(400, err.getMessage())))
                .onErrorResume(err -> {
                    log.error("iowa-gambling leaderboard submit-v2 error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private String normalizeUsername(String username) {
        if (username == null) {
            return null;
        }
        return username
                .replaceAll("[\\p{Cntrl}<>]", "")
                .trim();
    }
}
