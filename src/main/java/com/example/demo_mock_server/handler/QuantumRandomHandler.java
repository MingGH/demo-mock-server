package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;

import java.util.*;

/**
 * 量子随机数 Handler
 * 代理调用 ANU 量子随机数生成器 API
 * 数据来源：https://qrng.anu.edu.au/
 * 
 * 这些随机数是通过测量真空的量子涨落实时生成的。
 * 在量子物理学中，即使是完全的真空也存在零点能量，
 * 电磁场在所有频率上都表现出相位和振幅的随机波动。
 */
public class QuantumRandomHandler implements Handler<RoutingContext> {

    private final WebClient webClient;
    
    public QuantumRandomHandler(Vertx vertx) {
        WebClientOptions options = new WebClientOptions()
            .setDefaultHost("api.996.ninja")
            .setDefaultPort(443)
            .setSsl(true)
            .setTrustAll(true)
            .setConnectTimeout(10000);
        this.webClient = WebClient.create(vertx, options);
    }

    @Override
    public void handle(RoutingContext ctx) {
        // 解析参数
        int count = getIntParam(ctx, "count", 10);
        int min = getIntParam(ctx, "min", 1);
        int max = getIntParam(ctx, "max", 100);
        boolean unique = "true".equalsIgnoreCase(ctx.request().getParam("unique"));
        
        // 参数校验
        if (count < 1 || count > 1000) {
            sendError(ctx, 400, "count must be between 1 and 1000");
            return;
        }
        if (min >= max) {
            sendError(ctx, 400, "min must be less than max");
            return;
        }
        if (unique && (max - min + 1) < count) {
            sendError(ctx, 400, "range too small for unique numbers");
            return;
        }
        
        // 调用量子随机数 API
        fetchQuantumNumbers(ctx, count, min, max, unique);
    }
    
    private void fetchQuantumNumbers(RoutingContext ctx, int count, int min, int max, boolean unique) {
        // 如果需要唯一值，请求更多数字以确保有足够的唯一值
        int requestCount = unique ? Math.min(count * 3, 1000) : count;
        
        webClient.get("/random/numbers")
            .addQueryParam("count", String.valueOf(requestCount))
            .addQueryParam("min", String.valueOf(min))
            .addQueryParam("max", String.valueOf(max))
            .send()
            .onSuccess(response -> {
                try {
                    JsonArray numbers = response.bodyAsJsonArray();
                    List<Integer> result = new ArrayList<>();
                    
                    if (unique) {
                        // 去重并取前 count 个
                        Set<Integer> seen = new LinkedHashSet<>();
                        for (int i = 0; i < numbers.size() && seen.size() < count; i++) {
                            seen.add(numbers.getInteger(i));
                        }
                        result.addAll(seen);
                        
                        // 如果还不够，用本地随机数补充（极少发生）
                        Random random = new Random();
                        while (result.size() < count) {
                            int num = random.nextInt(max - min + 1) + min;
                            if (!result.contains(num)) {
                                result.add(num);
                            }
                        }
                    } else {
                        for (int i = 0; i < Math.min(numbers.size(), count); i++) {
                            result.add(numbers.getInteger(i));
                        }
                    }
                    
                    ctx.response()
                        .putHeader("Content-Type", "application/json")
                        .putHeader("Access-Control-Allow-Origin", "*")
                        .end(new JsonObject()
                            .put("status", 200)
                            .put("data", new JsonArray(result))
                            .put("source", "quantum")
                            .put("provider", "ANU QRNG")
                            .encode());
                            
                } catch (Exception e) {
                    sendError(ctx, 500, "Failed to parse quantum numbers: " + e.getMessage());
                }
            })
            .onFailure(err -> {
                System.err.println("Quantum API error: " + err.getMessage());
                // 降级到伪随机数
                fallbackToPseudoRandom(ctx, count, min, max, unique);
            });
    }
    
    private void fallbackToPseudoRandom(RoutingContext ctx, int count, int min, int max, boolean unique) {
        Random random = new Random();
        List<Integer> result = new ArrayList<>();
        
        if (unique) {
            Set<Integer> seen = new HashSet<>();
            while (seen.size() < count) {
                seen.add(random.nextInt(max - min + 1) + min);
            }
            result.addAll(seen);
        } else {
            for (int i = 0; i < count; i++) {
                result.add(random.nextInt(max - min + 1) + min);
            }
        }
        
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .putHeader("Access-Control-Allow-Origin", "*")
            .end(new JsonObject()
                .put("status", 200)
                .put("data", new JsonArray(result))
                .put("source", "pseudo")
                .put("provider", "Java Random (fallback)")
                .encode());
    }
    
    private int getIntParam(RoutingContext ctx, String name, int defaultValue) {
        String value = ctx.request().getParam(name);
        if (value == null || value.isEmpty()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
    
    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .putHeader("Access-Control-Allow-Origin", "*")
            .end(new JsonObject()
                .put("status", status)
                .put("message", message)
                .encode());
    }
}
