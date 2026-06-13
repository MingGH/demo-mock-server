package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.SriCheckService;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.util.Map;

/**
 * SRI 安全检测 HTTP 接口。
 * <p>
 * POST /sri/check — 检测目标 URL 的第三方资源 SRI 保护情况
 */
@RestController
@RequestMapping("/sri")
public class SriCheckController {

    private static final Logger log = LoggerFactory.getLogger(SriCheckController.class);

    private final SriCheckService service;

    public SriCheckController(SriCheckService service) {
        this.service = service;
    }

    @PostMapping("/check")
    public Mono<ResponseEntity<JsonNode>> check(@RequestBody Map<String, String> body) {
        String url = body.get("url");
        if (url == null || url.isBlank()) {
            return Mono.just(ApiResponse.error(400, "参数 url 不能为空"));
        }
        // 基础校验：必须是 http/https
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return Mono.just(ApiResponse.error(400, "URL 必须以 http:// 或 https:// 开头"));
        }

        return service.check(url)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("SRI check failed for {}: {}", url, err.getMessage());
                    String msg = "无法访问目标网站: " + err.getMessage();
                    return Mono.just(ApiResponse.error(502, msg));
                });
    }
}
