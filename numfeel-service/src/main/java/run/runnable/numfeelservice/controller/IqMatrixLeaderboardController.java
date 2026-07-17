package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.IqMatrixSubmitRequest;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.LimitQuery;
import run.runnable.numfeelservice.service.IqMatrixLeaderboardService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import tools.jackson.databind.JsonNode;

import java.util.Set;

/**
 * 矩阵推理与工作记忆挑战排行榜 HTTP 接口。
 * <p>
 * POST /iq-matrix/leaderboard 提交完整挑战成绩；
 * GET /iq-matrix/leaderboard 查询排行榜。
 */
@RestController
@RequestMapping("/iq-matrix/leaderboard")
public class IqMatrixLeaderboardController {

    private static final Logger log = LoggerFactory.getLogger(IqMatrixLeaderboardController.class);
    private static final int MAX_NAME_CODE_POINTS = 24;
    private static final Set<Integer> MATRIX_ACCURACY_VALUES = Set.of(
            0, 11, 22, 33, 44, 56, 67, 78, 89, 100
    );

    private final IqMatrixLeaderboardService service;

    public IqMatrixLeaderboardController(IqMatrixLeaderboardService service) {
        this.service = service;
    }

    /**
     * 提交一次完整挑战成绩。
     *
     * @param request 成绩和 Turnstile token
     * @param httpRequest HTTP 请求，用于解析客户端 IP
     * @return 当前名次、总人数和后端权威综合分
     */
    @PostMapping
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) IqMatrixSubmitRequest request,
            ServerHttpRequest httpRequest) {
        if (request == null) throw ApiException.badRequest("Invalid JSON");
        String name = sanitizeName(request.name());
        if (name.isEmpty()) throw ApiException.badRequest("name is required");
        if (name.codePointCount(0, name.length()) > MAX_NAME_CODE_POINTS) {
            throw ApiException.badRequest("name must not exceed 24 characters");
        }
        if (request.matrixAccuracy() == null || !MATRIX_ACCURACY_VALUES.contains(request.matrixAccuracy())) {
            throw ApiException.badRequest("invalid matrixAccuracy");
        }
        if (request.avgReactionMs() == null
                || request.avgReactionMs() < 100
                || request.avgReactionMs() > 30_000) {
            throw ApiException.badRequest("invalid avgReactionMs");
        }
        if (request.wmAccuracy() == null || request.wmAccuracy() < 0 || request.wmAccuracy() > 100) {
            throw ApiException.badRequest("invalid wmAccuracy");
        }
        if (request.cfTurnstileToken() == null || request.cfTurnstileToken().isBlank()) {
            throw ApiException.badRequest("cfTurnstileToken is required");
        }

        return service.submit(
                        name,
                        request.matrixAccuracy(),
                        request.avgReactionMs(),
                        request.wmAccuracy(),
                        request.cfTurnstileToken(),
                        ClientIp.resolve(httpRequest)
                )
                .map(ApiResponse::ok)
                .onErrorResume(IllegalArgumentException.class,
                        error -> Mono.just(ApiResponse.error(400, error.getMessage())))
                .onErrorResume(error -> {
                    log.error("iq-matrix submit error", error);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 查询排行榜。
     *
     * @param query 可选 limit，服务层会限制到 1-50
     * @return 排行榜条目和总人数
     */
    @GetMapping
    public Mono<ResponseEntity<JsonNode>> top(@ModelAttribute LimitQuery query) {
        int limit = parseLimit(query);
        return service.top(limit)
                .map(ApiResponse::ok)
                .onErrorResume(error -> {
                    log.error("iq-matrix top error", error);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private int parseLimit(LimitQuery query) {
        if (query == null || query.limit() == null || query.limit().isBlank()) return 20;
        try {
            return Integer.parseInt(query.limit());
        } catch (NumberFormatException error) {
            throw ApiException.badRequest("limit must be an integer");
        }
    }

    private String sanitizeName(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[\\p{Cntrl}<>]", "")
                .trim()
                .replaceAll("\\s+", " ");
    }
}
