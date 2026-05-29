package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.StroopStatsService;
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

/**
 * 斯特鲁普效应挑战 HTTP 处理器。
 * POST /stroop/submit  — 提交测试结果
 * GET  /stroop/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/stroop")
public class StroopStatsController {

    private static final Logger log = LoggerFactory.getLogger(StroopStatsController.class);

    private final StroopStatsService service;

    public StroopStatsController(StroopStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer total = Json.getInteger(body, "total");
        Integer correctCount = Json.getInteger(body, "correctCount");
        Double accuracy = Json.getDouble(body, "accuracy");
        Double avgRT = Json.getDouble(body, "avgRT");
        Double conAvgRT = Json.getDouble(body, "conAvgRT");
        Double incAvgRT = Json.getDouble(body, "incAvgRT");
        Double stroopEffect = Json.getDouble(body, "stroopEffect");
        String grade = Json.getString(body, "grade", "");

        if (total == null || total < 1 || total > 100) {
            throw ApiException.badRequest("invalid total");
        }
        if (correctCount == null || correctCount < 0 || correctCount > total) {
            throw ApiException.badRequest("invalid correctCount");
        }
        if (accuracy == null || accuracy < 0 || accuracy > 1) {
            throw ApiException.badRequest("invalid accuracy");
        }
        if (avgRT == null || avgRT < 0 || avgRT > 30000) {
            throw ApiException.badRequest("invalid avgRT");
        }
        if (conAvgRT == null || conAvgRT < 0 || conAvgRT > 30000) {
            throw ApiException.badRequest("invalid conAvgRT");
        }
        if (incAvgRT == null || incAvgRT < 0 || incAvgRT > 30000) {
            throw ApiException.badRequest("invalid incAvgRT");
        }
        if (stroopEffect == null || stroopEffect < -10000 || stroopEffect > 30000) {
            throw ApiException.badRequest("invalid stroopEffect");
        }
        if (grade.isBlank() || grade.length() > 16) {
            throw ApiException.badRequest("invalid grade");
        }

        return service.submit(total, correctCount, accuracy, avgRT, conAvgRT, incAvgRT, stroopEffect, grade)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("stroop submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("stroop stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
