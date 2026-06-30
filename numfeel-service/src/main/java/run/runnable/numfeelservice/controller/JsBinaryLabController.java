package run.runnable.numfeelservice.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;

/**
 * JS 二进制实验室 —— 对比与剖析数据接口。
 *
 * <p>直接从 classpath 下的 {@code data/} 目录读取预生成的 JSON 数据文件，
 * 不依赖外部服务，无状态。</p>
 *
 * <ul>
 *   <li>{@code GET /api/js-binary/comparison} — 返回 js-binary-comparison.json</li>
 *   <li>{@code GET /api/js-binary/anatomy} — 返回 js-binary-anatomy.json</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/js-binary")
public class JsBinaryLabController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 返回 JS 二进制对比数据。
     *
     * @return JSON 对比数据，通过 {@link ApiResponse#raw(Object)} 直接返回
     */
    @GetMapping("/comparison")
    public Mono<ResponseEntity<JsonNode>> comparison() {
        return Mono.fromCallable(() -> {
            try (InputStream in = new ClassPathResource("data/js-binary-comparison.json").getInputStream()) {
                return ApiResponse.raw(MAPPER.readTree(in));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * 返回 JS 二进制剖析数据。
     *
     * @return JSON 剖析数据，通过 {@link ApiResponse#raw(Object)} 直接返回
     */
    @GetMapping("/anatomy")
    public Mono<ResponseEntity<JsonNode>> anatomy() {
        return Mono.fromCallable(() -> {
            try (InputStream in = new ClassPathResource("data/js-binary-anatomy.json").getInputStream()) {
                return ApiResponse.raw(MAPPER.readTree(in));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }
}
