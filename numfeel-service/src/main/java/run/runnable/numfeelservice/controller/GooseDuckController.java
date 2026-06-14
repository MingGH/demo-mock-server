package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.GooseDuckSubmitRequest;
import run.runnable.numfeelservice.service.GooseDuckService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * 鹅腿 vs 鸭腿测评 HTTP 处理器。
 * <p>
 * POST /goose-duck/submit — 提交测评结果
 * GET  /goose-duck/stats  — 查询全局统计
 */
@RestController
@RequestMapping("/goose-duck")
public class GooseDuckController {

    private static final Logger log = LoggerFactory.getLogger(GooseDuckController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GooseDuckService service;

    public GooseDuckController(GooseDuckService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) Map<String, Object> body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }

        Integer correctCount = getInt(body, "correctCount");
        Integer total = getInt(body, "total");
        Object answers = body.get("answers");

        if (correctCount == null || correctCount < 0 || correctCount > 10) {
            throw ApiException.badRequest("invalid correctCount");
        }
        if (total == null || total < 1 || total > 10) {
            throw ApiException.badRequest("invalid total");
        }

        String answersJson = "[]";
        if (answers != null) {
            try {
                answersJson = MAPPER.writeValueAsString(answers);
            } catch (Exception e) {
                answersJson = "[]";
            }
        }

        return service.submit(correctCount, total, answersJson)
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("goose-duck submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("goose-duck stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private Integer getInt(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val instanceof Number n) return n.intValue();
        return null;
    }
}
