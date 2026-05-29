package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.SecKillStatsService;
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
 * 秒杀抢票模拟器统计 HTTP 处理器。
 * POST /seckill/submit  — 提交模拟结果
 * GET  /seckill/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/seckill")
public class SecKillStatsController {

    private static final Logger log = LoggerFactory.getLogger(SecKillStatsController.class);

    private final SecKillStatsService service;

    public SecKillStatsController(SecKillStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        Integer participants = Json.getInteger(body, "participants");
        Integer stock = Json.getInteger(body, "stock");
        Boolean userWon = Json.getBoolean(body, "userWon");
        Integer userRank = Json.getInteger(body, "userRank");
        Double userLatency = Json.getDouble(body, "userLatency");
        Double latencyGap = Json.getDouble(body, "latencyGap");

        if (participants == null || stock == null || userWon == null ||
                userRank == null || userLatency == null || latencyGap == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (participants < 1 || participants > 100000) {
            throw ApiException.badRequest("Invalid participants");
        }
        if (stock < 1 || stock > participants) {
            throw ApiException.badRequest("Invalid stock");
        }

        return service.submit(participants, stock, userWon, userRank, userLatency, latencyGap)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("seckill submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("seckill stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
