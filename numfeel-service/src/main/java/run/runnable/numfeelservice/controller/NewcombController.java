package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.NewcombSubmitRequest;
import run.runnable.numfeelservice.service.NewcombService;
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
 * 纽科姆悖论 HTTP 处理器。
 * POST /newcomb/submit  — 提交选择结果
 * GET  /newcomb/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/newcomb")
public class NewcombController {

    private static final Logger log = LoggerFactory.getLogger(NewcombController.class);

    private final NewcombService service;

    public NewcombController(NewcombService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) NewcombSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String choice = request.choice() == null ? "" : request.choice();
        String prediction = request.prediction() == null ? "" : request.prediction();
        Boolean hit = request.hit();
        Integer payoff = request.payoff();

        if (!service.isValidChoice(choice)) {
            throw ApiException.badRequest("invalid choice, must be 'one' or 'two'");
        }
        if (!service.isValidChoice(prediction)) {
            throw ApiException.badRequest("invalid prediction, must be 'one' or 'two'");
        }
        if (hit == null) {
            throw ApiException.badRequest("missing hit");
        }
        if (payoff == null || payoff < 0) {
            throw ApiException.badRequest("invalid payoff");
        }

        return service.submit(choice, prediction, hit, payoff)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("newcomb submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("newcomb stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
