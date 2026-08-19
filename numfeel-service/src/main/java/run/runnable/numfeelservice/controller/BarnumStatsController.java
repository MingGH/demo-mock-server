package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.BarnumSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.BarnumStatsResponse;
import run.runnable.numfeelservice.service.BarnumStatsService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import run.runnable.numfeelservice.web.ApiException;
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

    private final BarnumStatsService service;

    public BarnumStatsController(BarnumStatsService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ApiEnvelope<SubmitAckResponse>> submit(@RequestBody(required = false) BarnumSubmitRequest request) {
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
                .then(Mono.fromSupplier(() -> ApiEnvelope.ok(new SubmitAckResponse(true))));
    }

    @GetMapping("/stats")
    public Mono<ApiEnvelope<BarnumStatsResponse>> stats() {
        return service.stats()
                .map(ApiEnvelope::ok);
    }
}
