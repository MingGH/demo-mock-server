package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.BarnumStatsService;
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
 * 巴纳姆效应盲测 HTTP 处理器。
 * POST /barnum-test/submit — 提交测试结果
 * GET  /barnum-test/stats  — 查询全局分组统计
 */
@RestController
@RequestMapping("/barnum-test")
public class BarnumStatsController {

    private static final Logger log = LoggerFactory.getLogger(BarnumStatsController.class);

    private final BarnumStatsService service;

    public BarnumStatsController(BarnumStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String userGroup = Json.getString(body, "userGroup");
        if (userGroup == null || (!"tarot".equals(userGroup) && !"random".equals(userGroup))) {
            throw ApiException.badRequest("invalid userGroup");
        }
        int[] ratings = new int[5];
        for (int i = 0; i < 5; i++) {
            Integer r = Json.getInteger(body, "rating" + (i + 1));
            if (r == null || r < 1 || r > 5) {
                throw ApiException.badRequest("invalid rating" + (i + 1));
            }
            ratings[i] = r;
        }

        return service.submit(userGroup, ratings[0], ratings[1], ratings[2], ratings[3], ratings[4])
                .then(Mono.fromSupplier(() -> ApiResponse.ok(Json.obj().put("submitted", true))))
                .onErrorResume(err -> {
                    log.error("barnum submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("barnum stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
