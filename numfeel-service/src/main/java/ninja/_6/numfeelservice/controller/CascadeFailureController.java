package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.CascadeFailureService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * 级联故障模拟器统计 HTTP 处理器。
 * POST /cascade-failure/submit       — 提交模拟结果
 * GET  /cascade-failure/stats        — 全局统计
 * GET  /cascade-failure/leaderboard  — 排行榜
 */
@RestController
@RequestMapping("/cascade-failure")
public class CascadeFailureController {

    private static final Logger log = LoggerFactory.getLogger(CascadeFailureController.class);
    private static final Set<String> VALID_TOPOLOGY = Set.of("random", "scale-free", "grid", "modular");
    private static final Set<String> VALID_STRATEGY = Set.of("none", "hub", "distributed");

    private final CascadeFailureService service;

    public CascadeFailureController(CascadeFailureService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String topology = Json.getString(body, "topology", "").trim();
        int coupling = Json.getInteger(body, "coupling", 0);
        int capacity = Json.getInteger(body, "capacity", 0);
        String strategy = Json.getString(body, "strategy", "").trim();
        String triggerPos = Json.getString(body, "triggerPos", "").trim();
        Double survivalRate = Json.getDouble(body, "survivalRate");
        Integer cascadeSteps = Json.getInteger(body, "cascadeSteps");
        Integer maxComponent = Json.getInteger(body, "maxComponent");
        Integer totalNodes = Json.getInteger(body, "totalNodes");
        Integer score = Json.getInteger(body, "score");

        if (!VALID_TOPOLOGY.contains(topology) || !VALID_STRATEGY.contains(strategy)) {
            throw ApiException.badRequest("invalid topology or strategy");
        }
        if (coupling < 10 || coupling > 90 || capacity < 5 || capacity > 95) {
            throw ApiException.badRequest("invalid params");
        }
        if (survivalRate == null || survivalRate < 0 || survivalRate > 1) {
            throw ApiException.badRequest("invalid survivalRate");
        }
        if (cascadeSteps == null || cascadeSteps < 0 || cascadeSteps > 1000) {
            throw ApiException.badRequest("invalid cascadeSteps");
        }
        if (score == null || score < 0 || score > 100) {
            throw ApiException.badRequest("invalid score");
        }

        return service.submit(topology, coupling, capacity, strategy, triggerPos,
                        survivalRate, cascadeSteps, maxComponent != null ? maxComponent : 0,
                        totalNodes != null ? totalNodes : 0, score)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("cascade-failure submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("cascade-failure stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/leaderboard")
    public Mono<ResponseEntity<JsonNode>> leaderboard(
            @RequestParam(name = "limit", required = false) String limitParam) {
        int limit = parseLimit(limitParam, 20);
        return service.leaderboard(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("cascade-failure leaderboard error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private int parseLimit(String val, int def) {
        if (val == null) return def;
        try {
            return Math.max(1, Math.min(100, Integer.parseInt(val)));
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
