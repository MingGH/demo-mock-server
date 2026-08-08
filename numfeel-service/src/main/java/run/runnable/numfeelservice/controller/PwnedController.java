package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.PwnedService;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

/**
 * 密码泄露自查代理：转发 Have I Been Pwned 的 Pwned Passwords range 接口。
 * <p>
 * 采用 k-匿名（k-anonymity）机制——前端在本地把密码算成 SHA-1，只把<strong>前 5 位</strong>
 * 发到本接口，本接口再转发给 HIBP，返回该前缀下所有「后缀:出现次数」文本，由前端在本地比对。
 * 完整密码与完整哈希永远不离开用户浏览器，本服务也无从得知用户查的是哪个密码。
 * <p>
 * {@code GET /pwned/range/{prefix}} — prefix 必须是 5 位十六进制。
 */
@RestController
@RequestMapping("/pwned")
public class PwnedController {

    private final PwnedService pwnedService;

    public PwnedController(PwnedService pwnedService) {
        this.pwnedService = pwnedService;
    }

    /**
     * 查询某个 SHA-1 前缀下的全部后缀及出现次数。
     *
     * @param prefix 密码 SHA-1 哈希的前 5 位（十六进制，大小写不限）
     * @return 统一响应；data 内含 {@code prefix} 与 {@code range}（HIBP 原始文本）
     */
    @GetMapping(value = "/range/{prefix}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> range(@PathVariable String prefix) {
        if (!isValidPrefix(prefix)) {
            return Mono.just(ApiResponse.error(400, "prefix 必须是 5 位十六进制字符"));
        }
        String key = prefix.toUpperCase();

        return pwnedService.fetchRange(key)
                .map(body -> ApiResponse.ok(new RangeResult(key, body)))
                .onErrorResume(err -> Mono.just(ApiResponse.error(502, "上游泄露库查询暂不可用")));
    }

    /**
     * 校验前缀是否为 5 位十六进制。
     */
    boolean isValidPrefix(String prefix) {
        return prefix != null && prefix.matches("(?i)[0-9a-f]{5}");
    }

    /**
     * range 查询结果 DTO。
     *
     * @param prefix 规整为大写的 5 位前缀
     * @param range  HIBP 返回的纯文本，每行 {@code SUFFIX:COUNT}
     */
    public record RangeResult(String prefix, String range) {
    }
}
