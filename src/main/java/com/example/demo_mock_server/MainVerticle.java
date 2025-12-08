package com.example.demo_mock_server;

import com.example.demo_mock_server.config.RouterConfig;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;

public class MainVerticle extends AbstractVerticle {

    private static final int DEFAULT_PORT = 8080;

    @Override
    public void start() {
        RouterConfig routerConfig = new RouterConfig(vertx);
        Router router = routerConfig.createRouter();

        vertx.createHttpServer()
            .requestHandler(router)
            .listen(DEFAULT_PORT, res -> {
                if (res.succeeded()) {
                    System.out.println("Server started on port " + DEFAULT_PORT + 
                        ", http://localhost:" + DEFAULT_PORT + "/mock?n=2000");
                } else {
                    System.err.println("Failed to start server: " + res.cause().getMessage());
                }
            });
    }

    public static void main(String[] args) {
        Vertx vertx = Vertx.vertx();
        vertx.deployVerticle(new MainVerticle());
    }
}
