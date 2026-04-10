package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.InferenceLeaderboardService;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class InferenceLeaderboardHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private InferenceLeaderboardService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(InferenceLeaderboardService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        InferenceLeaderboardHandler handler = new InferenceLeaderboardHandler(mockService);
        router.post("/inference/leaderboard").handler(handler);
        router.get("/inference/leaderboard").handler(handler);

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
            .put("name", "测试用户").put("score", 420).put("rounds", 6)
            .put("wins", 4).put("grade", "数据侦探").put("rank", 3L);
        when(mockService.submit(eq("测试用户"), eq(420), eq(6), eq(4), eq("数据侦探")))
            .thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/inference/leaderboard")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "测试用户").put("score", 420)
                .put("rounds", 6).put("wins", 4).put("grade", "数据侦探"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                assertEquals(3L, body.getJsonObject("data").getLong("rank"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_name_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/inference/leaderboard")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("score", 300).put("rounds", 6).put("wins", 3).put("grade", "概率学徒"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_score_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/inference/leaderboard")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("name", "作弊者").put("score", 9999)
                .put("rounds", 6).put("wins", 6).put("grade", "统计大师"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_returns_leaderboard(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("leaders", new JsonArray().add(new JsonObject()
                .put("rank", 1).put("name", "第一名").put("score", 580)
                .put("rounds", 6).put("wins", 5).put("grade", "统计大师")))
            .put("total", 42L);
        when(mockService.top(anyInt())).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/inference/leaderboard")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(42L, body.getJsonObject("data").getLong("total"));
                assertEquals(1, body.getJsonObject("data").getJsonArray("leaders").size());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
