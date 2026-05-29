package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import ninja._6.numfeelservice.service.DevilDealService;
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
 * 恶魔交易诊断 HTTP 处理器。
 * POST /devil-deal/submit  — 提交测试结果
 * GET  /devil-deal/stats   — 查询全局统计
 */
@RestController
@RequestMapping("/devil-deal")
public class DevilDealController {

    private static final Logger log = LoggerFactory.getLogger(DevilDealController.class);

    private final DevilDealService service;

    public DevilDealController(DevilDealService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String dealType = Json.getString(body, "dealType", "");
        String secondType = Json.getString(body, "secondType", "");
        Integer powerPct = Json.getInteger(body, "powerPct");
        Integer lovePct = Json.getInteger(body, "lovePct");
        Integer moneyPct = Json.getInteger(body, "moneyPct");
        Integer revengePct = Json.getInteger(body, "revengePct");
        Integer recognitionPct = Json.getInteger(body, "recognitionPct");
        Integer knowledgePct = Json.getInteger(body, "knowledgePct");

        if (!service.isValidType(dealType)) {
            throw ApiException.badRequest("invalid dealType");
        }
        if (!service.isValidType(secondType)) {
            throw ApiException.badRequest("invalid secondType");
        }
        if (!service.isValidPct(powerPct)) {
            throw ApiException.badRequest("invalid powerPct");
        }
        if (!service.isValidPct(lovePct)) {
            throw ApiException.badRequest("invalid lovePct");
        }
        if (!service.isValidPct(moneyPct)) {
            throw ApiException.badRequest("invalid moneyPct");
        }
        if (!service.isValidPct(revengePct)) {
            throw ApiException.badRequest("invalid revengePct");
        }
        if (!service.isValidPct(recognitionPct)) {
            throw ApiException.badRequest("invalid recognitionPct");
        }
        if (!service.isValidPct(knowledgePct)) {
            throw ApiException.badRequest("invalid knowledgePct");
        }

        return service.submit(dealType, secondType, powerPct, lovePct, moneyPct,
                        revengePct, recognitionPct, knowledgePct)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("devil-deal submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("devil-deal stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
