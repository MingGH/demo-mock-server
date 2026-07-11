package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.ClearAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.BrainComputeSubmitRequest;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.LimitQuery;
import run.runnable.numfeelservice.service.BrainComputeService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 人脑算力排行榜 HTTP 处理器。
 * POST   /brain-compute/leaderboard  — 提交成绩（需 Turnstile 人机验证）
 * GET    /brain-compute/leaderboard  — 查询 top 榜
 * DELETE /brain-compute/leaderboard  — 清空
 * <p>
 * 综合分不信任前端自报值，由 service 层按反应/找猫/接球三项权威重算。
 */
@RestController
@RequestMapping("/brain-compute/leaderboard")
public class BrainComputeController {

    private static final Logger log = LoggerFactory.getLogger(BrainComputeController.class);
    private static final int MAX_NAME_LEN = 24;

    private final BrainComputeService service;

    public BrainComputeController(BrainComputeService service) {
        this.service = service;
    }

    @PostMapping
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) BrainComputeSubmitRequest request,
            ServerHttpRequest httpRequest) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String name = sanitize(request.name());
        if (name.isEmpty()) {
            throw ApiException.badRequest("name is required");
        }
        Integer reactionMs = request.reactionMs();
        Integer catMs = request.catMs();
        Integer ballScore = request.ballScore();
        // 边界校验：真人的成绩不可能落在这些区间之外，越界一律拒绝，配合 Turnstile 拦刷榜
        if (reactionMs == null || reactionMs < 100 || reactionMs > 5000) {
            throw ApiException.badRequest("invalid reactionMs");
        }
        if (catMs == null || catMs < 200 || catMs > 120000) {
            throw ApiException.badRequest("invalid catMs");
        }
        if (ballScore == null || ballScore < 0 || ballScore > 100) {
            throw ApiException.badRequest("invalid ballScore");
        }
        if (request.cfTurnstileToken() == null || request.cfTurnstileToken().isBlank()) {
            throw ApiException.badRequest("cfTurnstileToken is required");
        }
        String remoteIp = ClientIp.resolve(httpRequest);
        return service.submit(name, reactionMs, catMs, ballScore, request.cfTurnstileToken(), remoteIp)
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class, err ->
                        Mono.just(ApiResponse.error(400, err.getMessage())))
                .onErrorResume(err -> {
                    log.error("brain-compute submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping
    public Mono<ResponseEntity<JsonNode>> top(@ModelAttribute LimitQuery query) {
        int limit = 20;
        try {
            if (query != null && query.limit() != null) {
                limit = Integer.parseInt(query.limit());
            }
        } catch (NumberFormatException ignored) {
        }
        return service.top(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("brain-compute top error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @DeleteMapping
    public Mono<ResponseEntity<JsonNode>> clear() {
        return service.clear()
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new ClearAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("brain-compute clear error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private String sanitize(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("[\\p{Cntrl}<>]", "").trim().replaceAll("\\s+", " ");
        return s.length() > MAX_NAME_LEN ? s.substring(0, MAX_NAME_LEN) : s;
    }
}
