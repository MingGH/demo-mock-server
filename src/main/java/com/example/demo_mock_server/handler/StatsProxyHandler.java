package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;

/**
 * 统计代理 Handler
 * 代理调用 996.ninja 的计数器 API，隐藏 API Token
 */
public class StatsProxyHandler implements Handler<RoutingContext> {

    private final WebClient webClient;
    private final String apiToken;
    
    // 统计 key 前缀
    private static final String KEY_PREFIX = "wealth-btn-";
    public static final String KEY_PLAYERS = KEY_PREFIX + "players";      // 参与人数
    public static final String KEY_BANKRUPT = KEY_PREFIX + "bankrupt";    // 破产人数
    public static final String KEY_BILLIONAIRE = KEY_PREFIX + "billionaire"; // 过亿人数

    public StatsProxyHandler(Vertx vertx) {
        WebClientOptions options = new WebClientOptions()
            .setDefaultHost("api.996.ninja")
            .setDefaultPort(443)
            .setSsl(true)
            .setTrustAll(true);
        this.webClient = WebClient.create(vertx, options);
        
        // 从环境变量读取 API Token
        this.apiToken = System.getenv("NINJA_API_TOKEN");
        if (this.apiToken == null || this.apiToken.isEmpty()) {
            System.err.println("Warning: NINJA_API_TOKEN environment variable not set!");
        }
    }

    @Override
    public void handle(RoutingContext ctx) {
        String action = ctx.request().getParam("action");
        String key = ctx.request().getParam("key");
        
        if (action == null) {
            sendError(ctx, 400, "Missing action parameter");
            return;
        }

        switch (action) {
            case "incr":
                handleIncr(ctx, key);
                break;
            case "get":
                handleGet(ctx, key);
                break;
            case "getAll":
                handleGetAll(ctx);
                break;
            default:
                sendError(ctx, 400, "Invalid action: " + action);
        }
    }

    private void handleIncr(RoutingContext ctx, String key) {
        if (!isValidKey(key)) {
            sendError(ctx, 400, "Invalid key");
            return;
        }

        webClient.post("/counter/incr")
            .addQueryParam("key", key)
            .addQueryParam("n", "1")
            .putHeader("X-Api-Token", apiToken)
            .send()
            .onSuccess(response -> {
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(response.bodyAsString());
            })
            .onFailure(err -> sendError(ctx, 500, err.getMessage()));
    }

    private void handleGet(RoutingContext ctx, String key) {
        if (!isValidKey(key)) {
            sendError(ctx, 400, "Invalid key");
            return;
        }

        webClient.get("/counter/get")
            .addQueryParam("key", key)
            .putHeader("X-Api-Token", apiToken)
            .send()
            .onSuccess(response -> {
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(response.bodyAsString());
            })
            .onFailure(err -> sendError(ctx, 500, err.getMessage()));
    }

    private void handleGetAll(RoutingContext ctx) {
        // 并行获取三个统计数据
        JsonObject result = new JsonObject();
        
        webClient.get("/counter/get")
            .addQueryParam("key", KEY_PLAYERS)
            .putHeader("X-Api-Token", apiToken)
            .send()
            .onSuccess(r1 -> {
                int players = extractData(r1.bodyAsJsonObject());
                result.put("players", players);
                
                webClient.get("/counter/get")
                    .addQueryParam("key", KEY_BANKRUPT)
                    .putHeader("X-Api-Token", apiToken)
                    .send()
                    .onSuccess(r2 -> {
                        int bankrupt = extractData(r2.bodyAsJsonObject());
                        result.put("bankrupt", bankrupt);
                        
                        webClient.get("/counter/get")
                            .addQueryParam("key", KEY_BILLIONAIRE)
                            .putHeader("X-Api-Token", apiToken)
                            .send()
                            .onSuccess(r3 -> {
                                int billionaire = extractData(r3.bodyAsJsonObject());
                                result.put("billionaire", billionaire);
                                
                                ctx.response()
                                    .putHeader("Content-Type", "application/json")
                                    .end(new JsonObject()
                                        .put("status", 200)
                                        .put("data", result)
                                        .encode());
                            })
                            .onFailure(err -> sendError(ctx, 500, err.getMessage()));
                    })
                    .onFailure(err -> sendError(ctx, 500, err.getMessage()));
            })
            .onFailure(err -> sendError(ctx, 500, err.getMessage()));
    }

    private int extractData(JsonObject json) {
        if (json != null && json.containsKey("data")) {
            return json.getInteger("data", 0);
        }
        return 0;
    }

    private boolean isValidKey(String key) {
        return key != null && (
            key.equals(KEY_PLAYERS) ||
            key.equals(KEY_BANKRUPT) ||
            key.equals(KEY_BILLIONAIRE)
        );
    }

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("status", status)
                .put("message", message)
                .encode());
    }
}
