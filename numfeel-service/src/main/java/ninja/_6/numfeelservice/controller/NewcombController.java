package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.NewcombService;
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
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String choice = Json.getString(body, "choice", "");
        String prediction = Json.getString(body, "prediction", "");
        Boolean hit = Json.getBoolean(body, "hit");
        Integer payoff = Json.getInteger(body, "payoff");

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
