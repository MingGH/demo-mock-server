package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.CommonResponses.SubmitAckResponse;
import run.runnable.numfeelservice.controller.dto.GameplayRequests.KeystrokeSubmitRequest;
import run.runnable.numfeelservice.service.KeystrokeService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * 键盘输入节奏识别 HTTP 处理器。
 * POST /keystroke/submit — 提交打字样本
 * GET  /keystroke/stats  — 查询全站统计 + 指定 session 的指纹独特性
 */
@RestController
@RequestMapping("/keystroke")
public class KeystrokeController {

    private static final Logger log = LoggerFactory.getLogger(KeystrokeController.class);

    private final KeystrokeService service;

    public KeystrokeController(KeystrokeService service) {
        this.service = service;
    }

    @PostMapping("/submit")
    public Mono<ResponseEntity<JsonNode>> submit(@RequestBody(required = false) KeystrokeSubmitRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        if (request.sessionId() == null || request.sampleIndex() == null
                || request.textHash() == null || request.holdTimes() == null
                || request.intervals() == null || request.totalMs() == null
                || request.errorCount() == null) {
            throw ApiException.badRequest("Missing required fields");
        }
        if (request.sessionId().length() > 36 || request.sessionId().length() < 1) {
            throw ApiException.badRequest("Invalid sessionId");
        }
        if (request.sampleIndex() < 0 || request.sampleIndex() > 1) {
            throw ApiException.badRequest("Invalid sampleIndex");
        }
        if (request.totalMs() < 0 || request.totalMs() > 600000) {
            throw ApiException.badRequest("Invalid totalMs");
        }
        if (request.errorCount() < 0 || request.errorCount() > 127) {
            throw ApiException.badRequest("Invalid errorCount");
        }
        if (request.holdTimes().length() > 1024 || request.intervals().length() > 1024
                || request.textHash().length() > 32) {
            throw ApiException.badRequest("Invalid payload length");
        }

        return service.submit(
                        request.sessionId(),
                        request.sampleIndex(),
                        request.textHash(),
                        request.holdTimes(),
                        request.intervals(),
                        request.totalMs(),
                        request.errorCount())
                .then(Mono.fromSupplier(() -> ApiResponse.ok(new SubmitAckResponse(true))))
                .onErrorResume(err -> {
                    log.error("keystroke submit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats(@RequestParam(required = false) String sessionId) {
        return service.stats(sessionId)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("keystroke stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
