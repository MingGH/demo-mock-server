package com.example.demo_mock_server.config;

import com.example.demo_mock_server.generator.ChineseNameGenerator;
import com.example.demo_mock_server.generator.FakeDataGenerator;
import com.example.demo_mock_server.handler.BlockIpHandler;
import com.example.demo_mock_server.handler.BrowserFingerprintHandler;
import com.example.demo_mock_server.handler.ChineseNameHandler;
import com.example.demo_mock_server.handler.MemoryLeaderboardHandler;
import com.example.demo_mock_server.handler.MockHandler;
import com.example.demo_mock_server.handler.QuantumAvailableHandler;
import com.example.demo_mock_server.handler.QuantumRandomHandler;
import com.example.demo_mock_server.handler.RateLimitHandler;
import com.example.demo_mock_server.handler.StatsProxyHandler;
import com.example.demo_mock_server.handler.WordCloudHandler;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.ext.web.handler.CorsHandler;
import io.vertx.ext.web.handler.StaticHandler;
import io.vertx.mysqlclient.MySQLPool;

/**
 * 路由配置
 */
public class RouterConfig {

    private final Vertx vertx;
    private final MySQLPool mysqlPool;

    public RouterConfig(Vertx vertx, MySQLPool mysqlPool) {
        this.vertx = vertx;
        this.mysqlPool = mysqlPool;
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
        router.route().handler(BodyHandler.create());

        // 全局限流：每 IP 每分钟 200 次
        RateLimitHandler globalLimit = new RateLimitHandler(200, 60);
        // 指纹收集接口单独收紧：每 IP 每分钟 60 次
        RateLimitHandler fingerprintLimit = new RateLimitHandler(60, 60);

        router.route().handler(globalLimit);

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

        // 量子随机数接口
        QuantumRandomHandler quantumRandomHandler = new QuantumRandomHandler(vertx);
        router.get("/quantum/numbers").handler(quantumRandomHandler);
        
        // 量子随机数可用量查询
        QuantumAvailableHandler quantumAvailableHandler = new QuantumAvailableHandler(vertx);
        router.get("/quantum/available").handler(quantumAvailableHandler);

        MemoryLeaderboardHandler memoryLeaderboardHandler = new MemoryLeaderboardHandler();
        router.get("/memory-challenge/leaderboard").handler(memoryLeaderboardHandler);
        router.post("/memory-challenge/leaderboard").handler(memoryLeaderboardHandler);

        // 浏览器指纹接口
        BrowserFingerprintHandler fingerprintHandler = new BrowserFingerprintHandler(vertx, mysqlPool);
        router.post("/fingerprint/collect").handler(fingerprintLimit).handler(fingerprintHandler);
        router.get("/fingerprint/stats").handler(fingerprintHandler);

        // Static handler for pages and components
        router.route("/pages/*").handler(StaticHandler.create("pages"));
        router.route("/components/*").handler(StaticHandler.create("components"));
        router.route("/*").handler(StaticHandler.create("pages")); // Fallback to pages for root access
    }
}
