package run.runnable.numfeelservice.controller;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

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

    private static final Logger log = LoggerFactory.getLogger(PwnedController.class);

    /** HIBP Pwned Passwords range 接口基址。 */
    private static final String HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

    /** 缓存同一前缀的 range 结果，降低对上游的请求量（前缀空间仅 16^5）。 */
    private final Cache<String, String> rangeCache = Caffeine.newBuilder()
            .expireAfterWrite(6, TimeUnit.HOURS)
            .maximumSize(20_000)
            .build();

    private final WebClient webClient;

    /**
     * 构造器注入 WebClient.Builder，构建带超时、限制内存的客户端。
     *
     * @param webClientBuilder Spring 注入的 WebClient 构造器
     */
    public PwnedController(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024))
                .build();
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

        String cached = rangeCache.getIfPresent(key);
        if (cached != null) {
            return Mono.just(ApiResponse.ok(new RangeResult(key, cached)));
        }

        return webClient.get()
                .uri(HIBP_RANGE_URL + key)
                .header("User-Agent", "numfeel-pwned-check/1.0")
                .header("Add-Padding", "true")
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(10))
                .doOnNext(body -> rangeCache.put(key, body))
                .map(body -> ApiResponse.ok(new RangeResult(key, body)))
                .onErrorResume(err -> {
                    log.warn("查询 HIBP range 失败 prefix={}: {}", key, err.getMessage());
                    return Mono.just(ApiResponse.error(502, "上游泄露库查询暂不可用"));
                });
    }

    /**
     * 校验前缀是否为 5 位十六进制。
     *
     * @param prefix 待校验前缀
     * @return 合法返回 true
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
