package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import ninja._6.numfeelservice.service.SocialEngineeringRecord;
import ninja._6.numfeelservice.service.SocialEngineeringService;
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

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 社会工程学防骗挑战 HTTP 处理器。
 * POST /social-engineering/submit — 提交问卷
 * GET  /social-engineering/stats  — 全局 + 每题统计
 */
@RestController
@RequestMapping("/social-engineering")
public class SocialEngineeringController {

    private static final Logger log = LoggerFactory.getLogger(SocialEngineeringController.class);
    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final int MAX_QUESTIONS = 20;

    private final SocialEngineeringService service;

    public SocialEngineeringController(SocialEngineeringService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String sessionId = Json.getString(body, "sessionId", "");
        if (!UUID_PATTERN.matcher(sessionId).matches()) {
            throw ApiException.badRequest("Invalid sessionId");
        }

        Integer total = Json.getInteger(body, "total");
        Integer correct = Json.getInteger(body, "correct");
        if (total == null || correct == null || total < 1 || total > MAX_QUESTIONS
                || correct < 0 || correct > total) {
            throw ApiException.badRequest("Invalid total/correct");
        }

        ArrayNode rawQuestions = Json.getArray(body, "questions");
        if (rawQuestions == null || rawQuestions.isEmpty()) {
            throw ApiException.badRequest("questions required");
        }

        List<SocialEngineeringRecord.QuestionResult> questions = new ArrayList<>();
        for (int i = 0; i < Math.min(rawQuestions.size(), MAX_QUESTIONS); i++) {
            JsonNode q = rawQuestions.get(i);
            if (q == null || !q.isObject()) continue;

            Integer qId = Json.getInteger(q, "questionId");
            String tactic = Json.getString(q, "tactic", "");
            Boolean isFake = Json.getBoolean(q, "isFake");
            Boolean qCorrect = Json.getBoolean(q, "correct");

            if (qId == null || qId < 1 || qId > MAX_QUESTIONS
                    || tactic.isBlank() || isFake == null || qCorrect == null) continue;

            questions.add(new SocialEngineeringRecord.QuestionResult(
                    qId,
                    tactic.substring(0, Math.min(tactic.length(), 32)),
                    isFake,
                    qCorrect
            ));
        }

        if (questions.isEmpty()) {
            throw ApiException.badRequest("No valid questions");
        }

        SocialEngineeringRecord record = new SocialEngineeringRecord(sessionId, total, correct, questions);

        return service.submit(record)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
