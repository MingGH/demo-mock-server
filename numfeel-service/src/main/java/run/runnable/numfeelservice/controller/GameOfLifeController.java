package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.GameOfLifeSubmitRequest;
import run.runnable.numfeelservice.service.GameOfLifeService;
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

/**
 * 康威生命游戏图案记录 HTTP 处理器。
 * POST /game-of-life/submit — 提交图案运行记录
 * GET  /game-of-life/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/game-of-life")
public class GameOfLifeController {

    private static final Logger log = LoggerFactory.getLogger(GameOfLifeController.class);

    private final GameOfLifeService service;

    public GameOfLifeController(GameOfLifeService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) GameOfLifeSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String patternKey = request.patternKey() == null ? "" : request.patternKey();
        String gridData = request.gridData();
        Integer gridCols = request.gridCols();
        Integer gridRows = request.gridRows();
        String description = request.description() == null ? "" : request.description();

        if (patternKey.isBlank() || patternKey.length() > 32) {
            throw ApiException.badRequest("invalid patternKey");
        }
        if (gridData == null || gridData.isBlank() || gridData.length() > 65536) {
            throw ApiException.badRequest("invalid gridData");
        }
        if (gridCols == null || gridCols < 10 || gridCols > 500) {
            throw ApiException.badRequest("invalid gridCols");
        }
        if (gridRows == null || gridRows < 10 || gridRows > 500) {
            throw ApiException.badRequest("invalid gridRows");
        }
        if (description.length() > 256) {
            throw ApiException.badRequest("description too long");
        }

        return service.submit(patternKey, gridData, gridCols, gridRows, description)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("game-of-life submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.getStats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("game-of-life stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
