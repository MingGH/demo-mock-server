package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.InceptionMazeSubmitRequest;
import run.runnable.numfeelservice.service.InceptionMazeService;
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
 * 筑梦师测试 HTTP 处理器。
 * POST /inception-maze/submit  — 提交测试结果，返回排名
 * GET  /inception-maze/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/inception-maze")
public class InceptionMazeController {

    private static final Logger log = LoggerFactory.getLogger(InceptionMazeController.class);

    private final InceptionMazeService service;

    public InceptionMazeController(InceptionMazeService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) InceptionMazeSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer gridSize = request.gridSize();
        Integer pathLength = request.pathLength();
        Integer minPath = request.minPath();
        Double detour = request.detourRatio();
        Integer level = request.dreamLevel();
        Integer wallCount = request.wallCount();

        if (gridSize == null || gridSize < 5 || gridSize > 50) {
            throw ApiException.badRequest("invalid gridSize");
        }
        if (pathLength == null || pathLength < 1 || pathLength > 10000) {
            throw ApiException.badRequest("invalid pathLength");
        }
        if (minPath == null || minPath < 1 || minPath > 10000) {
            throw ApiException.badRequest("invalid minPath");
        }
        if (detour == null || detour < 0.5 || detour > 1000) {
            throw ApiException.badRequest("invalid detourRatio");
        }
        if (level == null || level < 0 || level > 5) {
            throw ApiException.badRequest("invalid dreamLevel");
        }
        if (wallCount == null || wallCount < 0 || wallCount > 10000) {
            throw ApiException.badRequest("invalid wallCount");
        }

        return service.submit(request)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("inception-maze submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("inception-maze stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
