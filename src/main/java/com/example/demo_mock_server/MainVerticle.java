package com.example.demo_mock_server;

import com.example.demo_mock_server.config.RouterConfig;
import com.example.demo_mock_server.service.GeoLocationService;
import com.example.demo_mock_server.service.WordCloudService;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.mysqlclient.MySQLConnectOptions;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.PoolOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MainVerticle extends AbstractVerticle {

    private static final Logger log = LoggerFactory.getLogger(MainVerticle.class);
    private static final int DEFAULT_PORT = 8080;

    @Override
    public void start() {
        MySQLPool pool = buildMySQLPool();

        // 初始化需要异步准备的服务
        GeoLocationService geoService = new GeoLocationService();
        WordCloudService wordCloudService = new WordCloudService();

        vertx.executeBlocking(promise -> {
            try {
                geoService.init();
                wordCloudService.initData();
                promise.complete();
            } catch (Exception e) {
                promise.fail(e);
            }
        }, res -> {
            if (res.failed()) {
                log.warn("Background service init failed: {}", res.cause().getMessage());
            }
            // 无论成功失败都预热词云（数据可能已存在）
            vertx.executeBlocking(p -> {
                wordCloudService.warmUp();
                p.complete();
            }, null);
        });

        RouterConfig routerConfig = new RouterConfig(vertx, pool, geoService, wordCloudService);
        Router router = routerConfig.createRouter();

        vertx.createHttpServer()
            .requestHandler(router)
            .listen(DEFAULT_PORT, res -> {
                if (res.succeeded()) {
                    log.info("Server started on port {}", DEFAULT_PORT);
                } else {
                    log.error("Failed to start server: {}", res.cause().getMessage());
                }
            });
    }

    public static void main(String[] args) {
        Vertx vertx = Vertx.vertx();
        vertx.deployVerticle(new MainVerticle());
    }

    private MySQLPool buildMySQLPool() {
        String host     = System.getenv().getOrDefault("MYSQL_HOST", "localhost");
        int    port     = Integer.parseInt(System.getenv().getOrDefault("MYSQL_PORT", "3306"));
        String db       = System.getenv().getOrDefault("MYSQL_DB", "demomockserver");
        String user     = System.getenv().getOrDefault("MYSQL_USER", "root");
        String password = System.getenv().getOrDefault("MYSQL_PASSWORD", "");

        MySQLConnectOptions connectOptions = new MySQLConnectOptions()
            .setHost(host).setPort(port).setDatabase(db)
            .setUser(user).setPassword(password)
            .setConnectTimeout(5000);

        return MySQLPool.pool(vertx, connectOptions, new PoolOptions().setMaxSize(5));
    }
}
