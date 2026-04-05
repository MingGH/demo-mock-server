package com.example.demo_mock_server.handler;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Cache;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * IP 级别滑动窗口限流
 * 每个窗口期内超过 maxRequests 次则返回 429
 */
public class RateLimitHandler implements Handler<RoutingContext> {

    private final int maxRequests;
    private final long windowSeconds;

    // key: ip, value: 当前窗口内的请求计数
    private final Cache<String, AtomicInteger> counter;

    public RateLimitHandler(int maxRequests, long windowSeconds) {
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
        this.counter = Caffeine.newBuilder()
            .expireAfterWrite(windowSeconds, TimeUnit.SECONDS)
            .maximumSize(10_000)
            .build();
    }

    @Override
    public void handle(RoutingContext ctx) {
        String ip = resolveIp(ctx);
        AtomicInteger count = counter.get(ip, k -> new AtomicInteger(0));
        int current = count.incrementAndGet();

        if (current > maxRequests) {
            ctx.response()
                .setStatusCode(429)
                .putHeader("Content-Type", "application/json")
                .putHeader("Retry-After", String.valueOf(windowSeconds))
                .end(new JsonObject()
                    .put("status", 429)
                    .put("message", "Too many requests, please slow down.")
                    .encode());
            return;
        }

        ctx.next();
    }

    private String resolveIp(RoutingContext ctx) {
        // 优先取反代透传的真实 IP
        String forwarded = ctx.request().getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = ctx.request().getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return ctx.request().remoteAddress() != null
            ? ctx.request().remoteAddress().host()
            : "unknown";
    }
}
