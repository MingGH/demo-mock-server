package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.ClearAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.InferenceLeaderboardSubmitRequest;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.LimitQuery;
import run.runnable.numfeelservice.service.InferenceLeaderboardService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 统计侦探排行榜 HTTP 处理器。
 * POST   /inference/leaderboard  — 提交成绩
 * GET    /inference/leaderboard  — 查询 top 榜
 * DELETE /inference/leaderboard  — 清空
 */
@RestController
@RequestMapping("/inference/leaderboard")
public class InferenceLeaderboardController {

    private static final Logger log = LoggerFactory.getLogger(InferenceLeaderboardController.class);
    private static final int MAX_NAME_LEN = 24;

    private final InferenceLeaderboardService service;

    public InferenceLeaderboardController(InferenceLeaderboardService service) {
        this.service = service;
    }

    @PostMapping
    public Mono<ResponseEntity<JsonNode>> submit(
            @RequestBody(required = false) InferenceLeaderboardSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String name = sanitize(request.name());
        if (name.isEmpty()) {
            throw ApiException.badRequest("name is required");
        }
        Integer score = request.score();
        Integer rounds = request.rounds();
        Integer wins = request.wins();
        String grade = request.grade() == null ? "" : request.grade();

        if (score == null || score < 0 || score > 600) {
            throw ApiException.badRequest("invalid score");
        }
        if (rounds == null || rounds < 1 || rounds > 6) {
            throw ApiException.badRequest("invalid rounds");
        }
        if (wins == null || wins < 0 || wins > rounds) {
            throw ApiException.badRequest("invalid wins");
        }
        if (grade.isBlank() || grade.length() > 16) {
            throw ApiException.badRequest("invalid grade");
        }

        return service.submit(name, score, rounds, wins, grade)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping
    public Mono<ResponseEntity<JsonNode>> top(@ModelAttribute LimitQuery query) {
        int limit = 20;
        try {
            if (query != null && query.limit() != null) {
                limit = Integer.parseInt(query.limit());
            }
        } catch (NumberFormatException ignored) {
        }
        return service.top(limit)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("top error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @DeleteMapping
    public Mono<ResponseEntity<JsonNode>> clear() {
        return service.clear()
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new ClearAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("clear error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private String sanitize(String raw) {
        if (raw == null) return "";
        String s = raw.trim().replaceAll("\\s+", " ");
        return s.length() > MAX_NAME_LEN ? s.substring(0, MAX_NAME_LEN) : s;
    }
}
