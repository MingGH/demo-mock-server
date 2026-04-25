package com.example.demo_mock_server.config;

import com.example.demo_mock_server.generator.ChineseNameGenerator;
import com.example.demo_mock_server.generator.FakeDataGenerator;
import com.example.demo_mock_server.handler.*;
import com.example.demo_mock_server.service.FingerprintService;
import com.example.demo_mock_server.service.GeoLocationService;
import com.example.demo_mock_server.service.InferenceLeaderboardService;
import com.example.demo_mock_server.service.SocialEngineeringService;
import com.example.demo_mock_server.service.CaptchaStatsService;
import com.example.demo_mock_server.service.StroopStatsService;
import com.example.demo_mock_server.service.WordCloudService;
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
    private final GeoLocationService geoService;
    private final WordCloudService wordCloudService;

    public RouterConfig(Vertx vertx, MySQLPool mysqlPool,
                        GeoLocationService geoService, WordCloudService wordCloudService) {
        this.vertx = vertx;
        this.mysqlPool = mysqlPool;
        this.geoService = geoService;
        this.wordCloudService = wordCloudService;
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
        router.route().handler(new RateLimitHandler(200, 60));

        // Mock 数据
        router.get("/mock").handler(new MockHandler(new FakeDataGenerator()));

        // 中文名生成
        router.get("/chinese-names").handler(new ChineseNameHandler(new ChineseNameGenerator()));

        // 词云
        router.get("/word-cloud").handler(new WordCloudHandler(vertx, wordCloudService));

        // BlockIP 代理（带缓存）
        router.get("/blockip/stats").handler(new BlockIpHandler(vertx, geoService));

        // 统计代理
        StatsProxyHandler statsProxy = new StatsProxyHandler(vertx);
        router.get("/stats").handler(statsProxy);
        router.post("/stats").handler(statsProxy);

        // 量子随机数
        router.get("/quantum/numbers").handler(new QuantumRandomHandler(vertx));
        router.get("/quantum/available").handler(new QuantumAvailableHandler(vertx));

        // 记忆挑战排行榜
        MemoryLeaderboardHandler leaderboard = new MemoryLeaderboardHandler();
        router.get("/memory-challenge/leaderboard").handler(leaderboard);
        router.post("/memory-challenge/leaderboard").handler(leaderboard);

        // 浏览器指纹（写接口单独收紧限流）
        FingerprintService fingerprintService = new FingerprintService(mysqlPool);
        BrowserFingerprintHandler fingerprintHandler = new BrowserFingerprintHandler(fingerprintService);
        router.post("/fingerprint/collect").handler(new RateLimitHandler(60, 60)).handler(fingerprintHandler);
        router.get("/fingerprint/stats").handler(fingerprintHandler);

        // 社会工程学防骗挑战
        SocialEngineeringService seService = new SocialEngineeringService(mysqlPool);
        SocialEngineeringHandler seHandler = new SocialEngineeringHandler(seService);
        router.post("/social-engineering/submit").handler(new RateLimitHandler(30, 60)).handler(seHandler);
        router.get("/social-engineering/stats").handler(seHandler);

        // 统计侦探排行榜
        InferenceLeaderboardService inferenceService = new InferenceLeaderboardService(mysqlPool);
        InferenceLeaderboardHandler inferenceHandler = new InferenceLeaderboardHandler(inferenceService);
        router.post("/inference/leaderboard").handler(new RateLimitHandler(10, 60)).handler(inferenceHandler);
        router.get("/inference/leaderboard").handler(inferenceHandler);
        router.delete("/inference/leaderboard").handler(inferenceHandler);

        // 斯特鲁普效应统计
        StroopStatsService stroopService = new StroopStatsService(mysqlPool);
        StroopStatsHandler stroopHandler = new StroopStatsHandler(stroopService);
        router.post("/stroop/submit").handler(new RateLimitHandler(10, 60)).handler(stroopHandler);
        router.get("/stroop/stats").handler(stroopHandler);

        // CAPTCHA 攻防实验室统计
        CaptchaStatsService captchaService = new CaptchaStatsService(mysqlPool);
        CaptchaStatsHandler captchaHandler = new CaptchaStatsHandler(captchaService);
        router.post("/captcha/submit").handler(new RateLimitHandler(10, 60)).handler(captchaHandler);
        router.get("/captcha/stats").handler(captchaHandler);

        // 筑梦师测试统计
        com.example.demo_mock_server.service.InceptionMazeService inceptionService =
            new com.example.demo_mock_server.service.InceptionMazeService(mysqlPool);
        com.example.demo_mock_server.handler.InceptionMazeHandler inceptionHandler =
            new com.example.demo_mock_server.handler.InceptionMazeHandler(inceptionService);
        router.post("/inception-maze/submit").handler(new RateLimitHandler(10, 60)).handler(inceptionHandler);
        router.get("/inception-maze/stats").handler(inceptionHandler);

        // 恶魔交易诊断统计
        com.example.demo_mock_server.service.DevilDealService devilDealService =
            new com.example.demo_mock_server.service.DevilDealService(mysqlPool);
        com.example.demo_mock_server.handler.DevilDealHandler devilDealHandler =
            new com.example.demo_mock_server.handler.DevilDealHandler(devilDealService);
        router.post("/devil-deal/submit").handler(new RateLimitHandler(10, 60)).handler(devilDealHandler);
        router.get("/devil-deal/stats").handler(devilDealHandler);

        // 文档追踪像素
        DocTrackHandler docTrackHandler = new DocTrackHandler();
        router.get("/doc-track/pixel").handler(docTrackHandler);
        router.get("/doc-track/events").handler(docTrackHandler);

        // 静态资源
        router.route("/pages/*").handler(StaticHandler.create("pages"));
        router.route("/components/*").handler(StaticHandler.create("components"));
        router.route("/*").handler(StaticHandler.create("pages"));
    }
}
