package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.WinningStrategyStatsService;
import ninja._6.numfeelservice.web.ApiException;
import ninja._6.numfeelservice.web.ApiResponse;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * 必胜策略游戏对局统计 HTTP 处理器。
 * POST /winning-strategy/submit — 提交对局结果
 * GET  /winning-strategy/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/winning-strategy")
public class WinningStrategyStatsController {

    private static final Logger log = LoggerFactory.getLogger(WinningStrategyStatsController.class);
    private static final Set<String> VALID_GAMES = Set.of("bash", "wythoff", "coin");
    private static final Set<String> VALID_RESULTS = Set.of("win", "lose");
    private static final Set<String> VALID_DIFFICULTIES = Set.of("easy", "normal", "hard");

    private final WinningStrategyStatsService service;

    public WinningStrategyStatsController(WinningStrategyStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String game = Json.getString(body, "game", "");
        String result = Json.getString(body, "result", "");
        String difficulty = Json.getString(body, "difficulty", "");
        Integer rounds = Json.getInteger(body, "rounds");

        if (!VALID_GAMES.contains(game)) {
            throw ApiException.badRequest("invalid game");
        }
        if (!VALID_RESULTS.contains(result)) {
            throw ApiException.badRequest("invalid result");
        }
        if (!VALID_DIFFICULTIES.contains(difficulty)) {
            throw ApiException.badRequest("invalid difficulty");
        }
        if (rounds == null || rounds < 1 || rounds > 500) {
            throw ApiException.badRequest("invalid rounds");
        }

        return service.submit(game, result, difficulty, rounds)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("winning-strategy submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.getStats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("winning-strategy stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
