package run.runnable.numfeelservice.web;

import org.springframework.http.server.reactive.ServerHttpRequest;

/**
 * 客户端真实 IP 解析。
 * 优先级：Cloudflare 头 > X-Forwarded-For 首段 > X-Real-IP > remoteAddress。
 * 与旧版 {@code RateLimitHandler.resolveIp} 行为一致。
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String resolve(ServerHttpRequest request) {
        String cfIp = request.getHeaders().getFirst("CF-Connecting-IP");
        if (cfIp != null && !cfIp.isBlank()) {
            return cfIp.trim();
        }
        String forwarded = request.getHeaders().getFirst("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeaders().getFirst("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        if (request.getRemoteAddress() != null && request.getRemoteAddress().getAddress() != null) {
            return request.getRemoteAddress().getAddress().getHostAddress();
        }
        return "unknown";
    }
}
