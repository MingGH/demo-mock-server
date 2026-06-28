package run.runnable.numfeelservice.service;

import tools.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * Cloudflare Turnstile 人机验证服务。
 * <p>
 * 调用 Cloudflare siteverify API 校验前端提交的 Turnstile token，
 * 确保排行榜提交来自真实用户而非脚本。
 */
@Service
public class TurnstileVerifier {

    private static final Logger log = LoggerFactory.getLogger(TurnstileVerifier.class);

    private static final String SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final String secretKey;
    private final WebClient webClient;

    public TurnstileVerifier(
            @Value("${turnstile.secret-key}") String secretKey,
            WebClient.Builder webClientBuilder) {
        this.secretKey = secretKey;
        this.webClient = webClientBuilder.build();
    }

    /**
     * 校验 Turnstile token。
     *
     * @param token    前端生成的 cf-turnstile-response token
     * @param remoteIp 客户真实 IP（可选，传 null 或空字符串跳过）
     * @return 验证通过返回空 Mono，失败返回 error
     */
    public Mono<Void> verify(String token, String remoteIp) {
        if (token == null || token.isBlank()) {
            return Mono.error(new IllegalArgumentException("turnstile token is required"));
        }
        return webClient.post()
                .uri(SITEVERIFY_URL)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("secret", secretKey)
                        .with("response", token)
                        .with("remoteip", remoteIp != null ? remoteIp : ""))
                .retrieve()
                .bodyToMono(SiteverifyResponse.class)
                .<Void>flatMap(r -> {
                    if (r.success()) {
                        return Mono.empty();
                    }
                    String errors = r.errorCodes() != null
                            ? String.join(",", r.errorCodes())
                            : "unknown";
                    log.warn("Turnstile verification failed: {}", errors);
                    return Mono.error(new IllegalArgumentException(
                            "Turnstile verification failed: " + errors));
                })
                .onErrorMap(e -> !(e instanceof IllegalArgumentException),
                        e -> {
                            log.warn("Turnstile siteverify request failed: {}", e.getMessage());
                            return new IllegalArgumentException("Turnstile verification unavailable");
                        });
    }

    /** Cloudflare siteverify 返回格式。 */
    record SiteverifyResponse(boolean success,
                              @JsonProperty("error-codes") List<String> errorCodes) {
    }
}
