package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.CosmicReaperService;
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
 * 宇宙收割者假说 HTTP 处理器。
 * POST /cosmic-reaper/submit — 提交模拟结果
 * GET  /cosmic-reaper/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/cosmic-reaper")
public class CosmicReaperController {

    private static final Logger log = LoggerFactory.getLogger(CosmicReaperController.class);
    private static final Set<String> VALID_STRATEGY = Set.of("aggressive", "balanced", "stealth", "dormant");

    private final CosmicReaperService service;

    public CosmicReaperController(CosmicReaperService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String strategy = Json.getString(body, "strategy", "").trim();
        Boolean escaped = Json.getBoolean(body, "escaped");
        Integer turns = Json.getInteger(body, "turns");
        Integer score = Json.getInteger(body, "score");
        Integer finalTech = Json.getInteger(body, "finalTech");
        Integer finalSignal = Json.getInteger(body, "finalSignal");
        Integer finalStealth = Json.getInteger(body, "finalStealth");

        if (!VALID_STRATEGY.contains(strategy)) {
            throw ApiException.badRequest("invalid strategy");
        }
        if (escaped == null || turns == null || score == null) {
            throw ApiException.badRequest("missing required fields");
        }
        if (turns < 0 || turns > 100 || score < 0 || score > 100) {
            throw ApiException.badRequest("invalid turns or score");
        }

        return service.submit(strategy, escaped, turns, score,
                        finalTech != null ? finalTech : 0,
                        finalSignal != null ? finalSignal : 0,
                        finalStealth != null ? finalStealth : 0)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("cosmic-reaper submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.getStats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("cosmic-reaper stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
