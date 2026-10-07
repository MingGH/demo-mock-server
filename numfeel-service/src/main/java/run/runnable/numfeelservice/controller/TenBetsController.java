package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.TenBetsLeaderboardSubmitRequest;
import run.runnable.numfeelservice.service.TenBetsService;
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
 * 十连注 — 策略排行榜与统计 HTTP 处理器。
 * <p>
 * GET  /ten-bets/leaderboard/challenge — 获取 PoW challenge（中签位服务器保密）
 * POST /ten-bets/leaderboard/submit    — 上传播注策略，服务器抽签重放结算
 * GET  /ten-bets/leaderboard           — 查询 top 榜 + 策略聚合统计
 */
@RestController
@RequestMapping("/ten-bets")
public class TenBetsController {

    private static final Logger log = LoggerFactory.getLogger(TenBetsController.class);

    private static final int MAX_USERNAME_LENGTH = 50;
    private static final int MAX_BETS_LENGTH = 200;

    private final TenBetsService service;

    public TenBetsController(TenBetsService service) {
        this.service = service;
    }

    @GetMapping("/leaderboard/challenge")
    public Mono<ResponseEntity<JsonNode>> createChallenge() {
        return service.createChallenge()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("ten-bets challenge error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @PostMapping("/leaderboard/submit")
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) TenBetsLeaderboardSubmitRequest request,
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
        if (request.mode() == null || request.mode().isBlank()) {
            throw ApiException.badRequest("mode is required");
        }
        if (request.bets() == null || request.bets().isBlank()) {
            throw ApiException.badRequest("bets is required");
        }
        if (request.bets().length() > MAX_BETS_LENGTH) {
            throw ApiException.badRequest("bets too long");
        }
        if (request.challengeId() == null || request.challengeId().isBlank()) {
            throw ApiException.badRequest("challengeId is required");
        }
        if (request.powHash() == null || request.powHash().isBlank()) {
            throw ApiException.badRequest("powHash is required");
        }
        if (request.powNonce() == null || request.powNonce().isBlank()) {
            throw ApiException.badRequest("powNonce is required");
        }
        if (request.cfTurnstileToken() == null || request.cfTurnstileToken().isBlank()) {
            throw ApiException.badRequest("cfTurnstileToken is required");
        }

        return service.submit(
                        username, request.mode(), request.bets(),
                        request.challengeId(), request.powHash(), request.powNonce(),
                        request.cfTurnstileToken(), remoteIp)
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class, err ->
                        Mono.just(ApiResponse.error(400, err.getMessage())))
                .onErrorResume(err -> {
                    log.error("ten-bets leaderboard submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/leaderboard")
    public Mono<ResponseEntity<JsonNode>> getLeaderboard(
            @RequestParam(defaultValue = "10") int limit) {
        return service.getLeaderboard(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("ten-bets leaderboard query error", err);
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
