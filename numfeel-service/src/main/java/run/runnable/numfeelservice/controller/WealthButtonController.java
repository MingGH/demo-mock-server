package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.WealthButtonLeaderboardSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.WealthButtonLeaderboardSubmitV2Request;
import run.runnable.numfeelservice.service.WealthButtonService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * 50%财富按钮 — 排行榜与统计 HTTP 处理器。
 * <p>
 * POST /wealth-button/incr?field=players|bankrupt|billionaire  — 递增统计
 * GET  /wealth-button/stats                                     — 查询聚合统计
 * GET  /wealth-button/leaderboard/challenge                     — 获取 PoW challenge
 * POST /wealth-button/leaderboard                               — 旧提交接口（已停用）
 * POST /wealth-button/leaderboard/submit-v2                     — 提交排行榜成绩
 * GET  /wealth-button/leaderboard                               — 查询排行榜 top10
 */
@RestController
@RequestMapping("/wealth-button")
public class WealthButtonController {

    private static final Logger log = LoggerFactory.getLogger(WealthButtonController.class);

    private static final Set<String> VALID_FIELDS = Set.of("players", "bankrupt", "billionaire");
    private static final int MAX_USERNAME_LENGTH = 50;

    private final WealthButtonService service;

    public WealthButtonController(WealthButtonService service) {
        this.service = service;
    }

    /**
     * 递增统计计数器。
     */
    @PostMapping("/incr")
    public Mono<ResponseEntity<JsonNode>> incrementStat(@RequestParam String field) {
        if (!VALID_FIELDS.contains(field)) {
            throw ApiException.badRequest("Invalid field: " + field);
        }
        return service.incrementStat(field)
                .then(Mono.fromCallable(() -> ApiResponse.ok("ok")))
                .onErrorResume(err -> {
                    log.error("wealth-button incr error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 查询聚合统计（参与人数、破产人数、资产过亿）。
     */
    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> getStats() {
        return service.getStats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("wealth-button stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 旧排行榜提交接口，保留兼容已发布前端。
     */
    @PostMapping("/leaderboard")
    public Mono<ResponseEntity<JsonNode>> submitLeaderboard(
            @RequestBody(required = false) WealthButtonLeaderboardSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }

        String username = normalizeUsername(request.username());
        if (username == null || username.isBlank()) {
            throw ApiException.badRequest("username is required");
        }
        if (username.length() > MAX_USERNAME_LENGTH) {
            throw ApiException.badRequest("username too long (max " + MAX_USERNAME_LENGTH + ")");
        }
        if (request.finalWealth() == null || request.returnRate() == null) {
            throw ApiException.badRequest("finalWealth and returnRate are required");
        }
        if (request.pressCount() == null || request.pressCount() <= 0) {
            throw ApiException.badRequest("pressCount must be > 0");
        }
        if (request.winCount() == null || request.winCount() < 0) {
            throw ApiException.badRequest("invalid winCount");
        }
        if (request.initialWealth() == null || request.initialWealth() <= 0) {
            throw ApiException.badRequest("invalid initialWealth");
        }
        if (request.roundHistory() == null || request.roundHistory().isEmpty()) {
            throw ApiException.badRequest("roundHistory is required");
        }
        if (request.powHash() == null || request.powHash().isBlank()) {
            throw ApiException.badRequest("powHash is required");
        }
        if (request.powNonce() == null || request.powNonce().isBlank()) {
            throw ApiException.badRequest("powNonce is required");
        }
        if (request.timestamp() == null) {
            throw ApiException.badRequest("timestamp is required");
        }

        return service.submitLeaderboard(
                        username, request.finalWealth(), request.returnRate(),
                        request.pressCount(), request.winCount(), request.initialWealth(),
                        request.roundHistory(), request.powHash(), request.powNonce(),
                        request.timestamp())
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class, err ->
                        Mono.just(ApiResponse.error(400, err.getMessage())))
                .onErrorResume(err -> {
                    log.error("wealth-button leaderboard submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 获取一次性 PoW challenge。
     */
    @GetMapping("/leaderboard/challenge")
    public Mono<ResponseEntity<JsonNode>> createLeaderboardChallenge() {
        return service.createLeaderboardChallenge()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("wealth-button leaderboard challenge error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 提交排行榜成绩（v2，由后端重算最终结果）。
     */
    @PostMapping("/leaderboard/submit-v2")
    public Mono<ResponseEntity<JsonNode>> submitLeaderboardV2(
            @RequestBody(required = false) WealthButtonLeaderboardSubmitV2Request request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }

        String username = normalizeUsername(request.username());
        if (username == null || username.isBlank()) {
            throw ApiException.badRequest("username is required");
        }
        if (username.length() > MAX_USERNAME_LENGTH) {
            throw ApiException.badRequest("username too long (max " + MAX_USERNAME_LENGTH + ")");
        }
        if (request.initialWealth() == null || request.initialWealth() <= 0) {
            throw ApiException.badRequest("invalid initialWealth");
        }
        if (request.roundHistory() == null || request.roundHistory().isEmpty()) {
            throw ApiException.badRequest("roundHistory is required");
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

        return service.submitLeaderboardV2(
                        username, request.initialWealth(), request.roundHistory(),
                        request.challengeId(), request.powHash(), request.powNonce())
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class, err ->
                        Mono.just(ApiResponse.error(400, err.getMessage())))
                .onErrorResume(err -> {
                    log.error("wealth-button leaderboard submit-v2 error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 查询排行榜（资产 top10 + 收益率 top10）。
     */
    @GetMapping("/leaderboard")
    public Mono<ResponseEntity<JsonNode>> getLeaderboard(
            @RequestParam(defaultValue = "10") int limit) {
        return service.getLeaderboard(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("wealth-button leaderboard query error", err);
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
