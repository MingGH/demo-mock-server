package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.SoritesSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SoritesStatsResponse;
import run.runnable.numfeelservice.service.SoritesService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import run.runnable.numfeelservice.web.ApiException;
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

    private final SoritesService service;

    public SoritesController(SoritesService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ApiEnvelope<SubmitAckResponse>> submit(@RequestBody(required = false) SoritesSubmitRequest request) {
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
                .then(Mono.fromSupplier(() -> ApiEnvelope.ok(new SubmitAckResponse(true))));
    }

    @GetMapping("/stats")
    public Mono<ApiEnvelope<SoritesStatsResponse>> stats() {
        return service.stats()
                .map(ApiEnvelope::ok);
    }
}
