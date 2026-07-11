package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.UtilityRequests.RandomBytesQuery;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.RandomDigitsQuery;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.RandomLotteryQuery;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.RandomBytesResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.RandomDigitsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.RandomLotteryResponse;
import run.runnable.numfeelservice.service.QuantumRandomService;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;

/**
 * 真随机数接口（熵源链 + 无偏抽取）。
 * <ul>
 *   <li>GET /random/bytes  — 原始随机字节 + 实际熵源</li>
 *   <li>GET /random/lottery — 服务端无偏抽取一注彩票</li>
 *   <li>GET /random/digits  — 固定位数/区间无偏随机数</li>
 * </ul>
 * 限流由 {@link run.runnable.numfeelservice.web.RateLimitWebFilter} 全局规则统一处理。
 */
@RestController
@RequestMapping("/random")
public class RandomController {

    private static final Logger log = LoggerFactory.getLogger(RandomController.class);

    private final QuantumRandomService randomService;

    public RandomController(QuantumRandomService randomService) {
        this.randomService = randomService;
    }

    /**
     * 取一段真随机字节。响应里 {@code source} 代表这一段到底来自哪个熵源；
     * {@code degraded} 为 true 表示从用户请求的源被降级过（诚实标注）。
     */
    @GetMapping(value = "/bytes", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> bytes(@ModelAttribute RandomBytesQuery query) {
        int count = parseInt(query == null ? null : query.count(), 16);
        String source = query == null ? null : query.source();
        if (count < 1 || count > 8192) {
            return Mono.just(ApiResponse.error(400, "count 必须在 1..8192"));
        }
        return randomService.bytes(count, source)
                .map(e -> {
                    RandomBytesResponse resp = new RandomBytesResponse(
                            e.bytes(), e.source(), e.provider(), e.degraded(), e.requestedSource());
                    return ApiResponse.ok(resp);
                })
                .doOnError(err -> log.warn("/random/bytes 失败: {}", err.getMessage()))
                .onErrorResume(err -> Mono.just(ApiResponse.error(500, "取熵失败，请稍后再试")));
    }

    /**
     * 服务端无偏抽取一注彩票。
     */
    @GetMapping(value = "/lottery", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> lottery(@ModelAttribute RandomLotteryQuery query) {
        String type = query == null || query.type() == null ? "" : query.type().trim().toLowerCase();
        if (!type.equals("ssq") && !type.equals("dlt")) {
            return Mono.just(ApiResponse.error(400, "type 只能是 ssq 或 dlt"));
        }
        String source = query == null ? null : query.source();
        return randomService.drawLottery(type, source == null || source.isBlank() ? null : source.toLowerCase())
                .map(d -> {
                    RandomLotteryResponse resp = new RandomLotteryResponse(
                            d.type(), d.red(), d.blue(), d.front(), d.back(),
                            d.source(), d.provider(), d.degraded());
                    return ApiResponse.ok(resp);
                })
                .doOnError(err -> log.warn("/random/lottery 失败: {}", err.getMessage()))
                .onErrorResume(err -> Mono.just(ApiResponse.error(500, "摇号失败，请稍后再试")));
    }

    /**
     * 固定位数 / 区间无偏随机数。
     */
    @GetMapping(value = "/digits", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> digits(@ModelAttribute RandomDigitsQuery query) {
        if (query == null) {
            return Mono.just(ApiResponse.error(400, "缺少参数"));
        }
        Integer min = parseIntOrDefaultNull(query.min());
        Integer max = parseIntOrDefaultNull(query.max());
        int length = parseInt(query.length(), 6);
        int count = parseInt(query.count(), 1);
        String source = query.source();
        boolean rangeMode = min != null && max != null;
        try {
            return randomService.drawDigits(
                            rangeMode ? 0 : length,
                            rangeMode ? min : Integer.MIN_VALUE,
                            rangeMode ? max : Integer.MIN_VALUE,
                            rangeMode ? count : 0,
                            source)
                    .map(d -> {
                        RandomDigitsResponse resp = new RandomDigitsResponse(
                                d.values(), d.value(), d.source(), d.provider(), d.degraded());
                        return ApiResponse.ok(resp);
                    })
                    .doOnError(err -> log.warn("/random/digits 失败: {}", err.getMessage()))
                    .onErrorResume(err -> Mono.just(ApiResponse.error(400, err.getMessage())));
        } catch (IllegalArgumentException ex) {
            return Mono.just(ApiResponse.error(400, ex.getMessage()));
        }
    }

    private int parseInt(String value, int def) {
        if (value == null || value.isBlank()) return def;
        try { return Integer.parseInt(value.trim()); } catch (NumberFormatException e) { return def; }
    }

    private Integer parseIntOrDefaultNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Integer.parseInt(value.trim()); } catch (NumberFormatException e) { return null; }
    }
}