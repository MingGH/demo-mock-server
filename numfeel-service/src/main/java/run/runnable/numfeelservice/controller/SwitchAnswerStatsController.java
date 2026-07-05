package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.SwitchAnswerSubmitRequest;
import run.runnable.numfeelservice.service.SwitchAnswerStatsService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 排除选项改答案 HTTP 处理器。
 * POST /switch-answer/submit  — 提交一轮决策结果
 * GET  /switch-answer/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/switch-answer")
public class SwitchAnswerStatsController {

    private static final Logger log = LoggerFactory.getLogger(SwitchAnswerStatsController.class);

    private final SwitchAnswerStatsService service;

    public SwitchAnswerStatsController(SwitchAnswerStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) SwitchAnswerSubmitRequest request,
                                                  ServerHttpRequest httpRequest) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String strategy = request.strategy();
        Boolean won = request.won();
        int options = request.options() == null ? 4 : request.options();
        int eliminated = request.eliminated() == null ? 2 : request.eliminated();

        if (strategy == null || (!strategy.equals("stay") && !strategy.equals("switch"))) {
            throw ApiException.badRequest("invalid strategy");
        }
        if (won == null) {
            throw ApiException.badRequest("invalid won");
        }
        if (options < 3 || options > 6) {
            throw ApiException.badRequest("invalid options");
        }
        if (eliminated < 1 || eliminated > options - 2) {
            throw ApiException.badRequest("invalid eliminated");
        }

        String ip = ClientIp.resolve(httpRequest);
        return service.submit(strategy, won, options, eliminated, ip)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("switch-answer submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("switch-answer stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
