package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.NimGameStatsService;
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
 * 尼姆游戏对局统计 HTTP 处理器。
 * POST /nim-game/submit  — 提交对局结果
 * GET  /nim-game/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/nim-game")
public class NimGameStatsController {

    private static final Logger log = LoggerFactory.getLogger(NimGameStatsController.class);
    private static final Set<String> VALID_RESULTS = Set.of("win", "lose");
    private static final Set<String> VALID_DIFFICULTIES = Set.of("easy", "normal", "hard");

    private final NimGameStatsService service;

    public NimGameStatsController(NimGameStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String result = Json.getString(body, "result", "");
        String difficulty = Json.getString(body, "difficulty", "");
        Integer rounds = Json.getInteger(body, "rounds");
        String preset = Json.getString(body, "preset", "classic");

        if (!VALID_RESULTS.contains(result)) {
            throw ApiException.badRequest("invalid result");
        }
        if (!VALID_DIFFICULTIES.contains(difficulty)) {
            throw ApiException.badRequest("invalid difficulty");
        }
        if (rounds == null || rounds < 1 || rounds > 200) {
            throw ApiException.badRequest("invalid rounds");
        }
        if (preset.length() > 16) {
            throw ApiException.badRequest("invalid preset");
        }

        return service.submit(result, difficulty, rounds, preset)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("nim submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.getStats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("nim stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
