package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.StroopStatsService;
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
class StroopStatsHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private StroopStatsService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(StroopStatsService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        StroopStatsHandler handler = new StroopStatsHandler(mockService);
        router.post("/stroop/submit").handler(handler);
        router.get("/stroop/stats").handler(handler);

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
            .put("rank", 5L)
            .put("totalSessions", 42L)
            .put("percentile", 88L);
        when(mockService.submit(
            eq(20), eq(18), eq(0.9), eq(520.0),
            eq(450.0), eq(620.0), eq(170.0), eq("正常水平")
        )).thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/stroop/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("total", 20).put("correctCount", 18)
                .put("accuracy", 0.9).put("avgRT", 520.0)
                .put("conAvgRT", 450.0).put("incAvgRT", 620.0)
                .put("stroopEffect", 170.0).put("grade", "正常水平"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                assertEquals(5L, body.getJsonObject("data").getLong("rank"));
                assertEquals(42L, body.getJsonObject("data").getLong("totalSessions"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_field_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/stroop/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("total", 20).put("correctCount", 18))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_total_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/stroop/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("total", 999).put("correctCount", 18)
                .put("accuracy", 0.9).put("avgRT", 520.0)
                .put("conAvgRT", 450.0).put("incAvgRT", 620.0)
                .put("stroopEffect", 170.0).put("grade", "正常水平"))
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
                .put("avgStroopEffect", 165.3)
                .put("avgRT", 580.2)
                .put("avgAccuracyPct", 87.5))
            .put("gradeDist", new JsonObject()
                .put("正常水平", 45L)
                .put("冷静选手", 30L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/stroop/stats")
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
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(
            anyInt(), anyInt(), anyDouble(), anyDouble(),
            anyDouble(), anyDouble(), anyDouble(), anyString()
        )).thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/stroop/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("total", 20).put("correctCount", 18)
                .put("accuracy", 0.9).put("avgRT", 520.0)
                .put("conAvgRT", 450.0).put("incAvgRT", 620.0)
                .put("stroopEffect", 170.0).put("grade", "正常水平"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
