package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.BarnumSubmitRequest;
import run.runnable.numfeelservice.service.BarnumStatsService;
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
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) BarnumSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String userGroup = request.userGroup();
        if (userGroup == null || (!"tarot".equals(userGroup) && !"random".equals(userGroup))) {
            throw ApiException.badRequest("invalid userGroup");
        }
        Integer[] ratings = {
                request.rating1(),
                request.rating2(),
                request.rating3(),
                request.rating4(),
                request.rating5()
        };
        for (int i = 0; i < ratings.length; i++) {
            Integer rating = ratings[i];
            if (rating == null || rating < 1 || rating > 5) {
                throw ApiException.badRequest("invalid rating" + (i + 1));
            }
        }

        return service.submit(userGroup, ratings[0], ratings[1], ratings[2], ratings[3], ratings[4])
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
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
