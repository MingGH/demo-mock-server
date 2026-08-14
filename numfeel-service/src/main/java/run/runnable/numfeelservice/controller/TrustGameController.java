package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.TrustGameSubmitRequest;
import run.runnable.numfeelservice.service.TrustGameService;
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
 * 信任博弈 HTTP 处理器。
 * POST /trust-game/submit — 提交博弈结果
 * GET  /trust-game/stats  — 查询全站统计
 */
@RestController
@RequestMapping("/trust-game")
public class TrustGameController {

    private static final Logger log = LoggerFactory.getLogger(TrustGameController.class);

    private final TrustGameService service;

    public TrustGameController(TrustGameService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) TrustGameSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        if (request.sessionId() == null || request.investAmount() == null
                || request.returnAmount() == null || request.totalEarned() == null
                || request.roleOrder() == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (request.sessionId().length() > 36 || request.sessionId().length() < 1) {
            throw ApiException.badRequest("Invalid sessionId");
        }
        if (request.investAmount() < 0 || request.investAmount() > 10000) {
            throw ApiException.badRequest("Invalid investAmount");
        }
        if (request.returnAmount() < 0 || request.returnAmount() > 30000) {
            throw ApiException.badRequest("Invalid returnAmount");
        }
        if (request.roleOrder() < 0 || request.roleOrder() > 1) {
            throw ApiException.badRequest("Invalid roleOrder");
        }
        // 两阶段收益合计 = 10000 + 2*投资 + AI返还 - 返还额，投资 0-10000 时上限 60000（投满且 AI 全返还、自己 0 返还）
        if (request.totalEarned() < 0 || request.totalEarned() > 60000) {
            throw ApiException.badRequest("Invalid totalEarned");
        }

        return service.submit(
                        request.sessionId(),
                        request.investAmount(),
                        request.returnAmount(),
                        request.totalEarned(),
                        request.roleOrder())
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("trust-game submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("trust-game stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
