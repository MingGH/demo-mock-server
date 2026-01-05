package com.example.demo_mock_server.config;

import com.example.demo_mock_server.generator.ChineseNameGenerator;
import com.example.demo_mock_server.generator.FakeDataGenerator;
import com.example.demo_mock_server.handler.BlockIpHandler;
import com.example.demo_mock_server.handler.ChineseNameHandler;
import com.example.demo_mock_server.handler.MockHandler;
import com.example.demo_mock_server.handler.StatsProxyHandler;
import com.example.demo_mock_server.handler.WordCloudHandler;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.CorsHandler;
import io.vertx.ext.web.handler.StaticHandler;

/**
 * 路由配置
 */
public class RouterConfig {

    private final Vertx vertx;

    public RouterConfig(Vertx vertx) {
        this.vertx = vertx;
    }

    public Router createRouter() {
        Router router = Router.router(vertx);
        
        configureCors(router);
        configureRoutes(router);
        
        return router;
    }

    private void configureCors(Router router) {
        router.route().handler(
            CorsHandler.create("*")
                .allowedMethod(HttpMethod.GET)
                .allowedMethod(HttpMethod.POST)
                .allowedMethod(HttpMethod.PUT)
                .allowedMethod(HttpMethod.DELETE)
                .allowedHeader("Content-Type")
                .allowedHeader("Authorization")
                .allowedHeader("Accept")
                .allowedHeader("Origin")
        );
    }

    private void configureRoutes(Router router) {
        FakeDataGenerator dataGenerator = new FakeDataGenerator();
        MockHandler mockHandler = new MockHandler(dataGenerator);
        router.get("/mock").handler(mockHandler);

        ChineseNameGenerator nameGenerator = new ChineseNameGenerator();
        ChineseNameHandler nameHandler = new ChineseNameHandler(nameGenerator);
        router.get("/chinese-names").handler(nameHandler);

        // Word Cloud
        WordCloudHandler wordCloudHandler = new WordCloudHandler(vertx);
        router.get("/word-cloud").handler(wordCloudHandler);

        // BlockIP 代理接口（带缓存和预处理）
        BlockIpHandler blockIpHandler = new BlockIpHandler(vertx);
        router.get("/blockip/stats").handler(blockIpHandler);

        // 统计代理接口
        StatsProxyHandler statsProxyHandler = new StatsProxyHandler(vertx);
        router.get("/stats").handler(statsProxyHandler);
        router.post("/stats").handler(statsProxyHandler);

        // Static handler for pages and components
        router.route("/pages/*").handler(StaticHandler.create("pages"));
        router.route("/components/*").handler(StaticHandler.create("components"));
        router.route("/*").handler(StaticHandler.create("pages")); // Fallback to pages for root access
    }
}
