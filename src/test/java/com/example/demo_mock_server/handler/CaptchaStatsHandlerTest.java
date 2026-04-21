package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.CaptchaStatsService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class CaptchaStatsHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private CaptchaStatsService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(CaptchaStatsService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        CaptchaStatsHandler handler = new CaptchaStatsHandler(mockService);
        router.post("/captcha/submit").handler(handler);
        router.get("/captcha/stats").handler(handler);

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
            .put("totalSessions", 50L)
            .put("percentile", 94.0);
        when(mockService.submit(any(JsonObject.class)))
            .thenReturn(Future.succeededFuture(mockResult));

        JsonObject levels = new JsonObject()
            .put("text", 1).put("math", 1).put("slider", 1).put("grid", 1)
            .put("click", 0).put("rotate", 1).put("spatial", 0).put("behavior", 1)
            .put("timeText", 5200).put("timeMath", 3100).put("timeSlider", 4500)
            .put("timeGrid", 8200).put("timeClick", 6300).put("timeRotate", 7100)
            .put("timeSpatial", 5800).put("timeBehavior", 9400);

        client.post(port, "localhost", "/captcha/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("passedCount", 6)
                .put("totalTimeMs", 49600)
                .put("grade", "A")
                .put("levels", levels))
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
    void post_missing_levels_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/captcha/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("passedCount", 6)
                .put("totalTimeMs", 49600)
                .put("grade", "A"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_passedCount_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/captcha/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("passedCount", 99)
                .put("totalTimeMs", 49600)
                .put("grade", "A")
                .put("levels", new JsonObject()))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_grade_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/captcha/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("passedCount", 6)
                .put("totalTimeMs", 49600)
                .put("levels", new JsonObject()))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_returns_data(VertxTestContext ctx) {
        JsonObject passRates = new JsonObject()
            .put("text", 92.5).put("math", 97.1).put("slider", 85.3)
            .put("grid", 68.2).put("click", 61.4).put("rotate", 78.9)
            .put("spatial", 55.7).put("behavior", 72.0);
        JsonObject avgTimes = new JsonObject()
            .put("text", 5.2).put("math", 3.1).put("slider", 4.5)
            .put("grid", 8.2).put("click", 6.3).put("rotate", 7.1)
            .put("spatial", 5.8).put("behavior", 9.4);
        JsonObject mockData = new JsonObject()
            .put("global", new JsonObject()
                .put("totalSessions", 200L)
                .put("avgPassed", 5.8)
                .put("avgTotalSec", 52.3)
                .put("passRates", passRates)
                .put("avgTimes", avgTimes))
            .put("gradeDist", new JsonObject()
                .put("S", 15L).put("A", 60L).put("B", 80L).put("C", 35L).put("D", 10L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/captcha/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(200L, data.getJsonObject("global").getLong("totalSessions"));
                assertTrue(data.containsKey("gradeDist"));
                assertTrue(data.getJsonObject("global").containsKey("passRates"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(any(JsonObject.class)))
            .thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/captcha/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("passedCount", 6)
                .put("totalTimeMs", 49600)
                .put("grade", "A")
                .put("levels", new JsonObject()
                    .put("text", 1).put("math", 1).put("slider", 1).put("grid", 1)
                    .put("click", 0).put("rotate", 1).put("spatial", 0).put("behavior", 1)
                    .put("timeText", 5200).put("timeMath", 3100).put("timeSlider", 4500)
                    .put("timeGrid", 8200).put("timeClick", 6300).put("timeRotate", 7100)
                    .put("timeSpatial", 5800).put("timeBehavior", 9400)))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.stats()).thenReturn(Future.failedFuture("DB down"));

        client.get(port, "localhost", "/captcha/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
