package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.HttpBinaryDemoService;
import run.runnable.numfeelservice.web.ApiResponse;

/**
 * HTTP 文本 vs 二进制传输对比演示接口。
 * <p>
 * 提供两个端点返回同一份社交动态流数据：
 * <ul>
 *   <li>{@code GET /api/http-demo/text} — JSON 文本（application/json），人类可读</li>
 *   <li>{@code GET /api/http-demo/binary} — MessagePack 二进制（application/octet-stream）</li>
 * </ul>
 * <p>
 * 前端通过并排对比两种格式的原始字节、解析耗时、渲染结果，直观展示文本协议的优势。
 */
@RestController
@RequestMapping("/api/http-demo")
public class HttpBinaryVsTextController {

    private final HttpBinaryDemoService service;

    public HttpBinaryVsTextController(HttpBinaryDemoService service) {
        this.service = service;
    }

    /**
     * 返回 JSON 文本格式的社交动态流数据。
     * <p>
     * 使用 {@link ApiResponse#raw(Object)} 直接返回 JSON 对象体，便于前端展示原始文本。
     */
    @GetMapping("/text")
    public Mono<ResponseEntity<tools.jackson.databind.JsonNode>> text() {
        return Mono.just(ApiResponse.raw(service.getData()));
    }

    /**
     * 返回 MessagePack 二进制格式的同一份社交动态流数据。
     * <p>
     * 该端点需要返回原始字节流以演示二进制传输，因此直接构造 ResponseEntity，
     * 不经过 {@link ApiResponse} 的 status/data 包装。
     */
    @GetMapping("/binary")
    public Mono<ResponseEntity<byte[]>> binary() {
        byte[] data = service.toBinary();
        return Mono.just(
                ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                        .header("Cache-Control", "no-cache, no-store")
                        .contentLength(data.length)
                        .body(data)
        );
    }
}
