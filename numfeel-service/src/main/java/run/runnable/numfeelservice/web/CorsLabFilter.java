package run.runnable.numfeelservice.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CorsDemoService;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 「跨域请求限制实验室」CORS 权威过滤器。
 * <p>
 * 只接管两个「受害者」路径：{@code /cors-lab/me} 与 {@code /cors-lab/transfer}。
 * 控制类路径（policy / transfers / reset）不在此处理，继续走全局 {@code WebConfig} 的 CORS 放行，
 * 保证前端随时能读写策略、查流水，不会被自己设的「deny」反锁在外面。
 * <p>
 * 全局 {@code WebConfig} 对 {@code /**} 用 {@code allowedOriginPatterns("*")} 放行了所有源，
 * 这意味着受害者路径默认也会被 Spring 自动加上 {@code Access-Control-Allow-Origin}——
 * 那就没法演示「跨域被拦」了。所以本过滤器在响应提交前（{@code beforeCommit}）把自己当成
 * 唯一权威：根据当前策略删掉或重写 Spring 写入的 CORS 头；预检请求则直接短路返回。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class CorsLabFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(CorsLabFilter.class);

    private static final String HDR_ORIGIN = "Origin";
    private static final String HDR_ACR_METHOD = "Access-Control-Request-Method";
    private static final String HDR_ACO_ORIGIN = "Access-Control-Allow-Origin";
    private static final String HDR_ACO_CREDENTIALS = "Access-Control-Allow-Credentials";
    private static final String HDR_ACO_METHODS = "Access-Control-Allow-Methods";
    private static final String HDR_ACO_HEADERS = "Access-Control-Allow-Headers";
    private static final String HDR_ACO_MAX_AGE = "Access-Control-Max-Age";
    private static final String HDR_VARY = "Vary";

    private final CorsDemoService service;

    public CorsLabFilter(CorsDemoService service) {
        this.service = service;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().pathWithinApplication().value();
        if (!isVictimPath(path)) {
            return chain.filter(exchange);
        }
        String token = exchange.getRequest().getQueryParams().getFirst("t");
        String mode = service.currentMode(token);
        String origin = exchange.getRequest().getHeaders().getFirst(HDR_ORIGIN);

        if (isPreflight(exchange)) {
            return handlePreflight(exchange.getResponse(), mode, origin);
        }
        applyActualHeaders(exchange.getResponse(), mode, origin);
        return chain.filter(exchange);
    }

    private static boolean isVictimPath(String path) {
        return path.equals("/cors-lab/me") || path.startsWith("/cors-lab/me?")
                || path.equals("/cors-lab/transfer") || path.startsWith("/cors-lab/transfer?");
    }

    private static boolean isPreflight(ServerWebExchange exchange) {
        return exchange.getRequest().getMethod() == HttpMethod.OPTIONS
                && exchange.getRequest().getHeaders().getFirst(HDR_ACR_METHOD) != null;
    }

    /**
     * 预检请求：本过滤器短路处理，Spring 的全局 CORS 不会插手。
     * deny 或无 Origin 时返回 403，浏览器据此阻止真正的请求发出。
     */
    private Mono<Void> handlePreflight(ServerHttpResponse response, String mode, String origin) {
        if (CorsDemoService.MODE_DENY.equals(mode) || origin == null) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            String body = "{\"status\":403,\"message\":\"preflight denied by CORS policy\"}";
            var buffer = response.bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8));
            return response.writeWith(Mono.just(buffer));
        }
        Map<String, String> headers = corsHeadersFor(mode, origin, true);
        response.setStatusCode(HttpStatus.NO_CONTENT);
        headers.forEach((k, v) -> response.getHeaders().set(k, v));
        return response.setComplete();
    }

    /**
     * 真正的请求：先放行给后续过滤器与处理器，但在响应提交前重写 CORS 头。
     * Spring 全局 CORS 可能已经写入了 {@code Access-Control-Allow-Origin}，这里先清掉再按策略重写，
     * 保证本过滤器是受害者路径上唯一的 CORS 权威。
     */
    private void applyActualHeaders(ServerHttpResponse response, String mode, String origin) {
        response.beforeCommit(() -> {
            HttpHeaders h = response.getHeaders();
            h.remove(HDR_ACO_ORIGIN);
            h.remove(HDR_ACO_CREDENTIALS);
            if (CorsDemoService.MODE_DENY.equals(mode) || origin == null) {
                // 默认拒绝：什么都不写，浏览器读不到响应体
                return Mono.empty();
            }
            corsHeadersFor(mode, origin, false).forEach(h::set);
            return Mono.empty();
        });
    }

    /**
     * 计算给定策略下应写入的 CORS 响应头（纯函数，便于单测）。
     *
     * @param mode      当前策略
     * @param origin    请求 Origin
     * @param preflight 是否预检请求；预检额外需要 Allow-Methods / Headers / Max-Age
     * @return 头部映射；{@code deny} 返回空 map（由调用方决定 403 或不写头）
     */
    public static Map<String, String> corsHeadersFor(String mode, String origin, boolean preflight) {
        Map<String, String> h = new LinkedHashMap<>();
        if (CorsDemoService.MODE_ALLOW.equals(mode)) {
            h.put(HDR_ACO_ORIGIN, "*");
        } else if (CorsDemoService.MODE_ALLOW_CREDENTIALS.equals(mode)) {
            h.put(HDR_ACO_ORIGIN, origin == null ? "null" : origin);
            h.put(HDR_ACO_CREDENTIALS, "true");
            h.put(HDR_VARY, HDR_ORIGIN);
        }
        if (preflight && !h.isEmpty()) {
            h.put(HDR_ACO_METHODS, "GET, POST, OPTIONS");
            h.put(HDR_ACO_HEADERS, "Content-Type, X-Demo, Authorization");
            h.put(HDR_ACO_MAX_AGE, "3600");
        }
        return h;
    }
}
