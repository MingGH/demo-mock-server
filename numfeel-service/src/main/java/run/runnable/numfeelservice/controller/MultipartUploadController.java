package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.MultipartUploadService;
import run.runnable.numfeelservice.web.ApiResponse;

/**
 * multipart/form-data 上传演示接口。
 * <p>
 * {@code POST /api/multipart/upload}，浏览器以 {@code FormData} 组装
 * 多个文件 + 普通字段后提交，服务端用真实 multipart 解析器逐个 part 解包，
 * 返回每个 part 的字段名、文件名、Content-Type 与字节数，直观展示
 * "multipart 是打包协议"这一结论。
 */
@RestController
@RequestMapping("/api/multipart")
public class MultipartUploadController {

    private final MultipartUploadService service;

    public MultipartUploadController(MultipartUploadService service) {
        this.service = service;
    }

    /**
     * 处理一次 multipart 上传。
     * <p>
     * 通过 {@code exchange.getMultipartData()} 获取全部 part（含文件与普通字段），
     * 委托给 Service 完成约束校验与落盘。
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<tools.jackson.databind.JsonNode>> upload(ServerWebExchange exchange) {
        return service.handle(exchange).map(ApiResponse::ok);
    }
}