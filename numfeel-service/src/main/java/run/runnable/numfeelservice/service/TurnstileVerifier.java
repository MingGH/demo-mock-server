package run.runnable.numfeelservice.service;

import com.fasterxml.jackson.annotation.JsonProperty;
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

    private final String siteVerifyUrl;
    private final String secretKey;
    private final WebClient webClient;

    public TurnstileVerifier(
            @Value("${turnstile.secret-key}") String secretKey,
            @Value("${turnstile.siteverify-url:https://challenges.cloudflare.com/turnstile/v0/siteverify}") String siteVerifyUrl,
            WebClient.Builder webClientBuilder) {
        this.secretKey = secretKey;
        this.siteVerifyUrl = siteVerifyUrl;
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
        return verify(token, remoteIp, null, null);
    }

    /**
     * 校验 Turnstile token，并在指定时验证 widget action，防止其他页面的 token 被复用。
     *
     * @param token 前端生成的 token
     * @param remoteIp 客户端真实 IP
     * @param expectedAction 期望 action；为空时不校验
     * @return 验证通过返回空 Mono，失败返回 error
     */
    public Mono<Void> verify(String token, String remoteIp, String expectedAction) {
        return verify(token, remoteIp, expectedAction, null);
    }

    /**
     * 校验 Turnstile token 的成功状态、action 与 hostname。
     *
     * @param token 前端生成的 token
     * @param remoteIp 客户端真实 IP
     * @param expectedAction 期望 action；为空时不校验
     * @param expectedHostname 期望 hostname；为空时不校验
     * @return 验证通过返回空 Mono，失败返回 error
     */
    public Mono<Void> verify(String token, String remoteIp, String expectedAction, String expectedHostname) {
        if (token == null || token.isBlank()) {
            return Mono.error(new IllegalArgumentException("turnstile token is required"));
        }
        return webClient.post()
                .uri(siteVerifyUrl)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("secret", secretKey)
                        .with("response", token)
                        .with("remoteip", remoteIp != null ? remoteIp : ""))
                .retrieve()
                .bodyToMono(SiteverifyResponse.class)
                .<Void>flatMap(response -> {
                    if (!response.success()) {
                        String errors = response.errorCodes() != null
                                ? String.join(",", response.errorCodes())
                                : "unknown";
                        log.warn("Turnstile verification failed: {}", errors);
                        return Mono.error(new IllegalArgumentException(
                                "Turnstile verification failed: " + errors));
                    }
                    if (expectedAction != null && !expectedAction.equals(response.action())) {
                        log.warn("Turnstile action mismatch: expected={}, actual={}",
                                expectedAction, response.action());
                        return Mono.error(new IllegalArgumentException("Turnstile action mismatch"));
                    }
                    if (expectedHostname != null && !expectedHostname.equalsIgnoreCase(response.hostname())) {
                        log.warn("Turnstile hostname mismatch: expected={}, actual={}",
                                expectedHostname, response.hostname());
                        return Mono.error(new IllegalArgumentException("Turnstile hostname mismatch"));
                    }
                    return Mono.empty();
                })
                .onErrorMap(error -> !(error instanceof IllegalArgumentException),
                        error -> {
                            log.warn("Turnstile siteverify request failed: {}", error.getMessage());
                            return new IllegalArgumentException("Turnstile verification unavailable");
                        });
    }

    /** Cloudflare siteverify 返回格式。 */
    record SiteverifyResponse(boolean success,
                              String action,
                              String hostname,
                              @JsonProperty("error-codes") List<String> errorCodes) {
    }
}
