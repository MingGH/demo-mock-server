package com.example.demo_mock_server;

import com.example.demo_mock_server.config.RouterConfig;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.mysqlclient.MySQLConnectOptions;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.PoolOptions;

public class MainVerticle extends AbstractVerticle {

    private static final int DEFAULT_PORT = 8080;

    @Override
    public void start() {
        MySQLPool pool = buildMySQLPool();
        RouterConfig routerConfig = new RouterConfig(vertx, pool);
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

    private MySQLPool buildMySQLPool() {
        String host = System.getenv().getOrDefault("MYSQL_HOST", "localhost");
        int port = Integer.parseInt(System.getenv().getOrDefault("MYSQL_PORT", "3306"));
        String db = System.getenv().getOrDefault("MYSQL_DB", "demomockserver");
        String user = System.getenv().getOrDefault("MYSQL_USER", "root");
        String password = System.getenv().getOrDefault("MYSQL_PASSWORD", "");

        MySQLConnectOptions connectOptions = new MySQLConnectOptions()
            .setHost(host)
            .setPort(port)
            .setDatabase(db)
            .setUser(user)
            .setPassword(password)
            .setConnectTimeout(5000);

        PoolOptions poolOptions = new PoolOptions().setMaxSize(5);
        return MySQLPool.pool(vertx, connectOptions, poolOptions);
    }
}
