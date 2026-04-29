package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.TimePerceptionService;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class TimePerceptionHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private TimePerceptionService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(TimePerceptionService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        TimePerceptionHandler handler = new TimePerceptionHandler(mockService);
        router.post("/time-perception/submit").handler(handler);
        router.get("/time-perception/stats").handler(handler);
        router.get("/time-perception/leaderboard").handler(handler);

        vertx.createHttpServer().requestHandler(router).listen(0, res -> {
            port = res.result().actualPort();
            client = WebClient.create(vertx);
            ctx.completeNow();
        });
    }

    @AfterEach
    void tearDown(VertxTestContext ctx) {
        vertx.close(ctx.succeedingThenComplete());
    }

    @Test
    void post_valid_returns_rank(VertxTestContext ctx) {
        JsonObject mockResult = new JsonObject()
            .put("rank", 3L)
            .put("totalSessions", 50L);
        when(mockService.submit(
            eq("测试玩家"), eq(75), eq(0.12), eq(0.13),
            eq(0.10), eq(0.18), eq(0.11),
            eq("overestimator"), eq("良好时感")
        )).thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/time-perception/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "测试玩家")
                .put("totalScore", 75)
                .put("weberScore", 0.12)
                .put("avgAbsDistortion", 0.13)
                .put("blankAvgDistortion", 0.10)
                .put("loadAvgDistortion", 0.18)
                .put("emotionAvgDistortion", 0.11)
                .put("biasDirection", "overestimator")
                .put("grade", "良好时感"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                assertEquals(3L, body.getJsonObject("data").getLong("rank"));
                assertEquals(50L, body.getJsonObject("data").getLong("totalSessions"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_name_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/time-perception/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("totalScore", 75).put("grade", "良好时感"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_score_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/time-perception/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "test").put("totalScore", 999)
                .put("weberScore", 0.12).put("avgAbsDistortion", 0.13)
                .put("blankAvgDistortion", 0.10).put("loadAvgDistortion", 0.18)
                .put("emotionAvgDistortion", 0.11)
                .put("biasDirection", "balanced").put("grade", "时间大师"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_bias_direction_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/time-perception/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "test").put("totalScore", 75)
                .put("weberScore", 0.12).put("avgAbsDistortion", 0.13)
                .put("blankAvgDistortion", 0.10).put("loadAvgDistortion", 0.18)
                .put("emotionAvgDistortion", 0.11)
                .put("biasDirection", "unknown").put("grade", "良好时感"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_returns_data(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("global", new JsonObject()
                .put("totalSessions", 100L)
                .put("avgScore", 62.5)
                .put("avgAbsDistortion", 0.18))
            .put("gradeDist", new JsonObject()
                .put("良好时感", 30L)
                .put("略有偏差", 45L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/time-perception/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(100L, data.getJsonObject("global").getLong("totalSessions"));
                assertTrue(data.containsKey("gradeDist"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_leaderboard_returns_data(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("leaders", new io.vertx.core.json.JsonArray()
                .add(new JsonObject().put("rank", 1L).put("name", "玩家1").put("score", 90).put("grade", "时间大师"))
                .add(new JsonObject().put("rank", 2L).put("name", "玩家2").put("score", 85).put("grade", "时间大师")))
            .put("total", 2L);
        when(mockService.leaderboard(eq(20))).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/time-perception/leaderboard?limit=20")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(2, body.getJsonObject("data").getJsonArray("leaders").size());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(
            anyString(), anyInt(), anyDouble(), anyDouble(),
            anyDouble(), anyDouble(), anyDouble(), anyString(), anyString()
        )).thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/time-perception/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "test").put("totalScore", 75)
                .put("weberScore", 0.12).put("avgAbsDistortion", 0.13)
                .put("blankAvgDistortion", 0.10).put("loadAvgDistortion", 0.18)
                .put("emotionAvgDistortion", 0.11)
                .put("biasDirection", "balanced").put("grade", "良好时感"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
