package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.SoritesService;
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
 * 沙堆悖论 HTTP 处理器。
 * <p>
 * POST /sorites/submit — 提交实验结果
 * GET  /sorites/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/sorites")
public class SoritesController {

    private static final Logger log = LoggerFactory.getLogger(SoritesController.class);

    private final SoritesService service;

    public SoritesController(SoritesService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer sandBoundary = Json.getInteger(body, "sandBoundary");
        String sandSharpness = Json.getString(body, "sandSharpness");
        Integer baldBoundary = Json.getInteger(body, "baldBoundary");
        Integer colorBoundary = Json.getInteger(body, "colorBoundary");

        if (sandBoundary == null || sandBoundary < -1 || sandBoundary > 10000) {
            throw ApiException.badRequest("invalid sandBoundary");
        }
        if (sandSharpness == null || sandSharpness.isEmpty()) {
            throw ApiException.badRequest("invalid sandSharpness");
        }
        if (baldBoundary == null || baldBoundary < 0 || baldBoundary > 100000) {
            throw ApiException.badRequest("invalid baldBoundary");
        }
        if (colorBoundary == null || colorBoundary < 0 || colorBoundary > 100) {
            throw ApiException.badRequest("invalid colorBoundary");
        }

        return service.submit(sandBoundary, sandSharpness, baldBoundary, colorBoundary)
                .then(Mono.fromSupplier(() -> ApiResponse.ok(Json.obj().put("submitted", true))))
                .onErrorResume(err -> {
                    log.error("sorites submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("sorites stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
