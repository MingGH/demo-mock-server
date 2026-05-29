package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.TimePerceptionService;
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

/**
 * 时间感知扭曲实验室 HTTP 处理器。
 * POST /time-perception/submit      — 提交结果
 * GET  /time-perception/stats       — 全局统计
 * GET  /time-perception/leaderboard — 排行榜
 */
@RestController
@RequestMapping("/time-perception")
public class TimePerceptionController {

    private static final Logger log = LoggerFactory.getLogger(TimePerceptionController.class);
    private static final int MAX_NAME_LEN = 24;

    private final TimePerceptionService service;

    public TimePerceptionController(TimePerceptionService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String name = Json.getString(body, "name", "").trim();
        Integer totalScore = Json.getInteger(body, "totalScore");
        Double weberScore = Json.getDouble(body, "weberScore");
        Double avgAbsDistortion = Json.getDouble(body, "avgAbsDistortion");
        Double blankAvgDistortion = Json.getDouble(body, "blankAvgDistortion");
        Double loadAvgDistortion = Json.getDouble(body, "loadAvgDistortion");
        Double emotionAvgDistortion = Json.getDouble(body, "emotionAvgDistortion");
        String biasDirection = Json.getString(body, "biasDirection", "");
        String grade = Json.getString(body, "grade", "");

        if (name.isEmpty() || name.length() > MAX_NAME_LEN) {
            throw ApiException.badRequest("invalid name");
        }
        if (totalScore == null || totalScore < 0 || totalScore > 100) {
            throw ApiException.badRequest("invalid totalScore");
        }
        if (weberScore == null || weberScore < 0 || weberScore > 5) {
            throw ApiException.badRequest("invalid weberScore");
        }
        if (avgAbsDistortion == null || avgAbsDistortion < 0 || avgAbsDistortion > 5) {
            throw ApiException.badRequest("invalid avgAbsDistortion");
        }
        if (blankAvgDistortion == null || blankAvgDistortion < 0 || blankAvgDistortion > 5) {
            throw ApiException.badRequest("invalid blankAvgDistortion");
        }
        if (loadAvgDistortion == null || loadAvgDistortion < 0 || loadAvgDistortion > 5) {
            throw ApiException.badRequest("invalid loadAvgDistortion");
        }
        if (emotionAvgDistortion == null || emotionAvgDistortion < 0 || emotionAvgDistortion > 5) {
            throw ApiException.badRequest("invalid emotionAvgDistortion");
        }
        if (!"overestimator".equals(biasDirection) && !"underestimator".equals(biasDirection)
                && !"balanced".equals(biasDirection)) {
            throw ApiException.badRequest("invalid biasDirection");
        }
        if (grade.isBlank() || grade.length() > 16) {
            throw ApiException.badRequest("invalid grade");
        }

        return service.submit(name, totalScore, weberScore, avgAbsDistortion,
                        blankAvgDistortion, loadAvgDistortion, emotionAvgDistortion,
                        biasDirection, grade)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("time-perception submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("time-perception stats error", err);
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
                    log.error("time-perception leaderboard error", err);
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
