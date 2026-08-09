package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.ZhihuAnalyzeService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

/**
 * 知乎创作分析处理器。
 * <p>
 * POST /zhihu/analyze — 拉取用户全部知乎创作内容并返回多维度分析结果。
 * Access Secret 需通过 HTTP Authorization 请求头传入，后端只透传不落日志。
 * <p>
 * 缓存：同一 token 的分析结果在后端内存里保留 15 分钟。
 * 期间内重复请求直接走缓存，并在响应中通过 {@code cache.cached=true} 提示前端。
 * 可选查询参数 {@code force=true} 强制跳过缓存重新拉取。
 */
@RestController
@RequestMapping("/zhihu")
public class ZhihuAnalyzeController {

    private static final Logger log = LoggerFactory.getLogger(ZhihuAnalyzeController.class);

    private final ZhihuAnalyzeService analyzeService;

    public ZhihuAnalyzeController(ZhihuAnalyzeService analyzeService) {
        this.analyzeService = analyzeService;
    }

    /**
     * 分析用户知乎创作内容。
     * <p>
     * 需要 Authorization 请求头传入知乎 Access Secret，格式为 {@code Bearer <secret>}。
     * 该 Secret 仅用于透传到知乎 API，后端不记录、不落库（缓存键为 SHA-256 哈希）。
     * 分析完成后建议用户立即在知乎开放平台删除该 Secret。
     *
     * @param force 选填查询参数 {@code force=true} 时强制跳过缓存
     */
    @PostMapping("/analyze")
    public Mono<ResponseEntity<JsonNode>> analyze(ServerHttpRequest request) {
        String authHeader = request.getHeaders().getFirst("Authorization");
        if (authHeader == null || authHeader.isBlank()) {
            throw ApiException.badRequest("请提供知乎 Access Secret（Authorization: Bearer <secret>）");
        }
        String accessSecret = authHeader.startsWith("Bearer ")
                ? authHeader.substring(7).trim()
                : authHeader.trim();
        if (accessSecret.isEmpty()) {
            throw ApiException.badRequest("Access Secret 不能为空");
        }
        boolean force = "true".equalsIgnoreCase(request.getQueryParams().getFirst("force"));
        if (force) {
            log.info("zhihu analyze: force refresh requested");
        } else {
            log.info("zhihu analyze: starting analysis");
        }
        return analyzeService.analyze(accessSecret, force)
                .map(result -> ApiResponse.okWithCache(result.data(), result.cache()))
                .onErrorResume(ApiException.class, e -> {
                    log.warn("zhihu analyze: business error: {}", e.getMessage());
                    return Mono.just(ApiResponse.error(e.status(), e.getMessage()));
                })
                .onErrorResume(e -> {
                    log.error("zhihu analyze: unexpected error: {}", e.getMessage());
                    return Mono.just(ApiResponse.error(500, "分析失败，请稍后重试"));
                });
    }
}

