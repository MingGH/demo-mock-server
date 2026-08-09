package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * HIBP Pwned Passwords range 查询服务。
 * <p>
 * 转发 Have I Been Pwned 的 k-匿名 range 接口，结果通过 @Cacheable 缓存 6 小时。
 */
@Service
public class PwnedService {

    private static final Logger log = LoggerFactory.getLogger(PwnedService.class);
    private static final String HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

    private final WebClient webClient;

    public PwnedService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024))
                .build();
    }

    /**
     * 查询指定 SHA-1 前缀（大写 5 位 hex）对应的 range 数据。
     *
     * @param prefix 大写 5 位十六进制前缀
     * @return HIBP 返回的纯文本（每行 SUFFIX:COUNT）
     */
    @Cacheable(cacheNames = "pwnedRange", sync = true)
    public Mono<String> fetchRange(String prefix) {
        return webClient.get()
                .uri(HIBP_RANGE_URL + prefix)
                .header("User-Agent", "numfeel-pwned-check/1.0")
                .header("Add-Padding", "true")
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(10))
                .doOnError(err -> log.warn("查询 HIBP range 失败 prefix={}: {}", prefix, err.getMessage()));
    }
}
