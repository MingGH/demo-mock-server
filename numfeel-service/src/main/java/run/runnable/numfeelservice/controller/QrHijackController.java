package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.QrHijackService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 二维码劫持（QRLjacking）演示 HTTP 处理器。
 *
 * POST /qr-hijack/session         — 创建一个登录 session（模拟网站生成登录码）
 * GET  /qr-hijack/session/{token} — 轮询 session 状态（PC 端检测是否被"扫码登录"）
 * POST /qr-hijack/scan/{token}    — 模拟手机扫码确认（将 session 标记为已劫持）
 * GET  /qr-hijack/stats           — 全局统计：多少人体验了、多少人被"劫持"
 */
@RestController
@RequestMapping("/qr-hijack")
public class QrHijackController {

    private static final Logger log = LoggerFactory.getLogger(QrHijackController.class);

    private final QrHijackService service;

    public QrHijackController(QrHijackService service) {
        this.service = service;
    }

    /**
     * 创建一个新的模拟登录 session。
     * 返回 token（前端用来生成二维码）和过期时间。
     */
    @PostMapping("/session")
    public Mono<ResponseEntity<JsonNode>> createSession() {
        return service.createSession()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("createSession error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * PC 端轮询 session 状态。
     * 返回 status: "pending" | "scanned" | "expired"
     */
    @GetMapping("/session/{token}")
    public Mono<ResponseEntity<JsonNode>> pollSession(@PathVariable String token) {
        if (token == null || token.length() > 64) {
            throw ApiException.badRequest("Invalid token");
        }
        return service.pollSession(token)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("pollSession error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 模拟手机扫码确认。
     * 接收 User-Agent 作为"身份凭证"演示。
     */
    @PostMapping("/scan/{token}")
    public Mono<ResponseEntity<JsonNode>> scan(
            @PathVariable String token,
            @RequestHeader(value = "User-Agent", defaultValue = "Unknown") String userAgent) {
        if (token == null || token.length() > 64) {
            throw ApiException.badRequest("Invalid token");
        }
        return service.scan(token, userAgent)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("scan error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 全局统计数据。
     */
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
