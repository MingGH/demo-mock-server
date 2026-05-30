package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.CosmicReaperSubmitRequest;
import run.runnable.numfeelservice.service.CosmicReaperService;
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
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) CosmicReaperSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String strategy = request.strategy() == null ? "" : request.strategy().trim();
        Boolean escaped = request.escaped();
        Integer turns = request.turns();
        Integer score = request.score();
        Integer finalTech = request.finalTech();
        Integer finalSignal = request.finalSignal();
        Integer finalStealth = request.finalStealth();

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
