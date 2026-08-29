package run.runnable.numfeelservice.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.BookDetailDTO;
import run.runnable.numfeelservice.controller.dto.BookStoreStatusDTO;
import run.runnable.numfeelservice.controller.dto.CatalogResponseDTO;
import run.runnable.numfeelservice.service.RestVsGraphqlService;
import run.runnable.numfeelservice.web.ApiEnvelope;

import java.util.concurrent.TimeUnit;

/**
 * REST vs GraphQL 对比实验 — REST 端点。
 * <p>
 * 提供三种 GET 查询来与 GraphQL POST 对比。其中目录查询带 {@code Cache-Control} 响应头，
 * 用于演示 REST 的核心优势之一：GET 天然可被浏览器/CDN 缓存，而 GraphQL 的 POST 不可缓存。
 * <p>
 * 由于需要设置响应头 {@code Cache-Control}（这正是"为什么 REST 利于缓存"这一论点要展示的对象），
 * 此处使用 {@link ResponseEntity} 包裹 {@link ApiEnvelope}，属于少数需要显式控制响应头的例外场景。
 */
@RestController
@RequestMapping("/api/rest-vs-graphql")
public class RestVsGraphqlController {

    private final RestVsGraphqlService service;

    public RestVsGraphqlController(RestVsGraphqlService service) {
        this.service = service;
    }

    /**
     * 完整套餐目录：返回书目全部字段，用于演示 over-fetch 的字节浪费。
     *
     * @param limit 返回条数，默认 20
     * @return 完整目录响应（带 60 秒 Cache-Control）
     */
    @GetMapping("/catalog/full")
    public Mono<ResponseEntity<ApiEnvelope<CatalogResponseDTO>>> catalogFull(
            @RequestParam(defaultValue = "20") int limit) {
        return service.catalog(true, limit)
                .map(ApiEnvelope::ok)
                .map(body -> apiCached(body));
    }

    /**
     * 瘦身版目录：只返回页面核心字段，用于证明"REST 同样可以省字节"。
     *
     * @param limit 返回条数，默认 20
     * @return 瘦身目录响应（带 60 秒 Cache-Control）
     */
    @GetMapping("/catalog/light")
    public Mono<ResponseEntity<ApiEnvelope<CatalogResponseDTO>>> catalogLight(
            @RequestParam(defaultValue = "20") int limit) {
        return service.catalog(false, limit)
                .map(ApiEnvelope::ok)
                .map(body -> apiCached(body));
    }

    /**
     * 单书详情（含书评）。
     *
     * @param id 书 ID
     * @return 书详情响应（带 60 秒 Cache-Control）
     */
    @GetMapping("/book/{id}")
    public Mono<ResponseEntity<ApiEnvelope<BookDetailDTO>>> book(@PathVariable int id) {
        return service.book(id)
                .map(ApiEnvelope::ok)
                .map(body -> apiCached(body));
    }

    /**
     * 数据集初始化状态。
     *
     * @return 三表行数与数据是否就绪
     */
    @GetMapping("/status")
    public Mono<ResponseEntity<ApiEnvelope<BookStoreStatusDTO>>> status() {
        return service.status()
                .map(ApiEnvelope::ok)
                .map(body -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body));
    }

    /** 用 60 秒 Cache-Control 包裹响应体（REST 可缓存演示）。 */
    private <T> ResponseEntity<ApiEnvelope<T>> apiCached(ApiEnvelope<T> body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(body);
    }
}