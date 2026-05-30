package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.SoritesSubmitRequest;
import run.runnable.numfeelservice.service.SoritesService;
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
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) SoritesSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer sandBoundary = request.sandBoundary();
        String sandSharpness = request.sandSharpness();
        Integer baldBoundary = request.baldBoundary();
        Integer colorBoundary = request.colorBoundary();

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
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
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
