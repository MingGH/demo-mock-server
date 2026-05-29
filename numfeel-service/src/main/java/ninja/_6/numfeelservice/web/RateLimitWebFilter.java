package ninja._6.numfeelservice.web;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;

/**
 * IP 级别滑动窗口限流（基于 Caffeine），等价于旧版 Vert.x {@code RateLimitHandler} 的组合用法。
 * <p>
 * 规则（每个 IP）：
 * <ul>
 *   <li>全局：每分钟 200 次（所有请求）</li>
 *   <li>{@code POST /fingerprint/collect}：每分钟 60 次</li>
 *   <li>{@code POST /social-engineering/submit}：每分钟 30 次</li>
 *   <li>其余写接口（各种 {@code /submit}、{@code POST /inference/leaderboard}）：每分钟 10 次</li>
 * </ul>
 * 命中任一规则上限即返回 429。请求需同时满足全局规则与最具体的匹配规则。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitWebFilter implements WebFilter {

    /** 单条限流规则：匹配条件 + 窗口内最大请求数 + 独立计数缓存。 */
    private static final class Rule {
        final Predicate<ServerHttpRequest> matches;
        final int maxRequests;
        final long windowSeconds;
        final Cache<String, AtomicInteger> counter;

        Rule(Predicate<ServerHttpRequest> matches, int maxRequests, long windowSeconds) {
            this.matches = matches;
            this.maxRequests = maxRequests;
            this.windowSeconds = windowSeconds;
            this.counter = Caffeine.newBuilder()
                    .expireAfterWrite(windowSeconds, TimeUnit.SECONDS)
                    .maximumSize(10_000)
                    .build();
        }

        /** @return 命中上限返回 false（应拒绝）。 */
        boolean tryAcquire(String ip) {
            AtomicInteger count = counter.get(ip, k -> new AtomicInteger(0));
            return count.incrementAndGet() <= maxRequests;
        }
    }

    private final List<Rule> rules = new ArrayList<>();

    public RateLimitWebFilter() {
        // 全局：200/min
        rules.add(new Rule(req -> true, 200, 60));
        // 指纹采集：60/min
        rules.add(new Rule(isPost("/fingerprint/collect"), 60, 60));
        // 社工防骗提交：30/min
        rules.add(new Rule(isPost("/social-engineering/submit"), 30, 60));
        // 其余写接口：10/min
        rules.add(new Rule(req -> isWriteThrottled(req), 10, 60));
    }

    private static Predicate<ServerHttpRequest> isPost(String path) {
        return req -> "POST".equals(req.getMethod().name()) && req.getPath().value().endsWith(path);
    }

    private static boolean isWriteThrottled(ServerHttpRequest req) {
        String method = req.getMethod().name();
        String path = req.getPath().value();
        if ("POST".equals(method) && path.endsWith("/submit")) {
            // 指纹与社工有更专门的规则，这里排除避免重复计入 10/min 桶
            return !path.endsWith("/fingerprint/collect") && !path.endsWith("/social-engineering/submit");
        }
        return "POST".equals(method) && path.endsWith("/inference/leaderboard");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String ip = ClientIp.resolve(request);

        long retryAfter = 0;
        boolean limited = false;
        for (Rule rule : rules) {
            if (rule.matches.test(request)) {
                if (!rule.tryAcquire(ip)) {
                    limited = true;
                    retryAfter = rule.windowSeconds;
                    break;
                }
            }
        }

        if (limited) {
            return tooManyRequests(exchange.getResponse(), retryAfter);
        }
        return chain.filter(exchange);
    }

    private Mono<Void> tooManyRequests(ServerHttpResponse response, long retryAfter) {
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        response.getHeaders().set("Retry-After", String.valueOf(retryAfter));
        String body = "{\"status\":429,\"message\":\"Too many requests, please slow down.\"}";
        var buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }
}
