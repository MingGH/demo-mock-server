package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;

/**
 * 量子随机数可用量查询 Handler
 * 查询当前持有的量子随机数总量
 */
public class QuantumAvailableHandler implements Handler<RoutingContext> {

    private final WebClient webClient;
    private final String apiToken;
    
    public QuantumAvailableHandler(Vertx vertx) {
        WebClientOptions options = new WebClientOptions()
            .setDefaultHost("api.996.ninja")
            .setDefaultPort(443)
            .setSsl(true)
            .setTrustAll(true)
            .setConnectTimeout(10000);
        this.webClient = WebClient.create(vertx, options);
        
        this.apiToken = System.getenv("NINJA_API_TOKEN");
        if (this.apiToken == null || this.apiToken.isEmpty()) {
            System.err.println("Warning: NINJA_API_TOKEN environment variable not set!");
        }
    }

    @Override
    public void handle(RoutingContext ctx) {
        webClient.get("/random/available")
            .putHeader("X-Api-Token", apiToken)
            .send()
            .onSuccess(response -> {
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .putHeader("Access-Control-Allow-Origin", "*")
                    .end(response.bodyAsString());
            })
            .onFailure(err -> {
                ctx.response()
                    .setStatusCode(500)
                    .putHeader("Content-Type", "application/json")
                    .putHeader("Access-Control-Allow-Origin", "*")
                    .end(new JsonObject()
                        .put("status", 500)
                        .put("message", err.getMessage())
                        .encode());
            });
    }
}
