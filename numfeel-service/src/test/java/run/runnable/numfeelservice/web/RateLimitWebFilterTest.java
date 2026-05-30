package run.runnable.numfeelservice.web;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitWebFilterTest {

    @Test
    void generic_submit_is_limited_after_ten_requests_per_minute() {
        RateLimitWebFilter filter = new RateLimitWebFilter();
        AtomicInteger passed = new AtomicInteger();
        WebFilterChain chain = exchange -> {
            passed.incrementAndGet();
            return Mono.empty();
        };

        for (int i = 0; i < 10; i++) {
            MockServerWebExchange exchange = exchange(HttpMethod.POST, "/sorites/submit");
            filter.filter(exchange, chain).block();
            assertThat(exchange.getResponse().getStatusCode()).isNull();
        }

        MockServerWebExchange rejected = exchange(HttpMethod.POST, "/sorites/submit");
        filter.filter(rejected, chain).block();

        assertThat(passed).hasValue(10);
        assertThat(rejected.getResponse().getStatusCode().value()).isEqualTo(429);
        assertThat(rejected.getResponse().getHeaders().getFirst("Retry-After")).isNotBlank();
        assertThat(rejected.getResponse().getBodyAsString().block())
                .isEqualTo("{\"status\":429,\"message\":\"Too many requests, please slow down.\"}");
    }

    @Test
    void fingerprint_collect_uses_sixty_per_minute_rule_instead_of_generic_submit_rule() {
        RateLimitWebFilter filter = new RateLimitWebFilter();
        AtomicInteger passed = new AtomicInteger();
        WebFilterChain chain = exchange -> {
            passed.incrementAndGet();
            return Mono.empty();
        };

        for (int i = 0; i < 60; i++) {
            MockServerWebExchange exchange = exchange(HttpMethod.POST, "/fingerprint/collect");
            filter.filter(exchange, chain).block();
            assertThat(exchange.getResponse().getStatusCode()).isNull();
        }

        MockServerWebExchange rejected = exchange(HttpMethod.POST, "/fingerprint/collect");
        filter.filter(rejected, chain).block();

        assertThat(passed).hasValue(60);
        assertThat(rejected.getResponse().getStatusCode().value()).isEqualTo(429);
    }

    private MockServerWebExchange exchange(HttpMethod method, String path) {
        return MockServerWebExchange.from(
                MockServerHttpRequest.method(method, path)
                        .header("X-Real-IP", "203.0.113.8")
        );
    }
}
