package run.runnable.numfeelservice.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.AvatarConvertService;
import run.runnable.numfeelservice.web.ApiException;

/**
 * 「知乎动态头像注入器」格式转换接口。
 * <p>
 * {@code POST /avatar/convert-webp}，请求体为 gif 原始字节
 * （Content-Type: image/gif），响应为动态 webp 二进制
 * （Content-Type: image/webp），前端拿到后直接内嵌进注入脚本。
 */
@RestController
@RequestMapping("/avatar")
public class AvatarConvertController {

    private final AvatarConvertService service;

    public AvatarConvertController(AvatarConvertService service) {
        this.service = service;
    }

    /**
     * 动态 gif 转动态 webp。
     *
     * @param body gif 原始字节
     * @return 动态 webp 二进制
     */
    @PostMapping(value = "/convert-webp", consumes = "image/gif", produces = "image/webp")
    public Mono<ResponseEntity<byte[]>> convertWebp(@RequestBody Mono<byte[]> body) {
        return body.switchIfEmpty(Mono.error(ApiException.badRequest("请求体为空")))
                .flatMap(service::gifToAnimatedWebp)
                .map(webp -> ResponseEntity.ok()
                        .contentType(MediaType.valueOf("image/webp"))
                        .header(HttpHeaders.CACHE_CONTROL, "no-store")
                        .body(webp));
    }
}
