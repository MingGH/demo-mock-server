package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.NewcombService;
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
class NewcombHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private NewcombService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(NewcombService.class);

        when(mockService.isValidChoice(anyString())).thenCallRealMethod();

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        NewcombHandler handler = new NewcombHandler(mockService);
        router.post("/newcomb/submit").handler(handler);
        router.get("/newcomb/stats").handler(handler);

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

    private JsonObject validBody() {
        return new JsonObject()
            .put("choice", "one")
            .put("prediction", "one")
            .put("hit", true)
            .put("payoff", 1000000);
    }

    @Test
    void post_valid_returns_stats(VertxTestContext ctx) {
        JsonObject mockResult = new JsonObject()
            .put("total", 100L)
            .put("oneBox", 55L)
            .put("twoBox", 45L)
            .put("hits", 88L)
            .put("hitRate", 88.0)
            .put("oneBoxPct", 55.0)
            .put("twoBoxPct", 45.0)
            .put("avgOnePayoff", 900000L)
            .put("avgTwoPayoff", 1000L);
        when(mockService.submit(eq("one"), eq("one"), eq(true), eq(1000000)))
            .thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody())
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                JsonObject data = body.getJsonObject("data");
                assertEquals(100L, data.getLong("total"));
                assertEquals(55L, data.getLong("oneBox"));
                assertEquals(45L, data.getLong("twoBox"));
                assertEquals(88L, data.getLong("hits"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_two_box_choice_valid(VertxTestContext ctx) {
        JsonObject mockResult = new JsonObject()
            .put("total", 1L).put("oneBox", 0L).put("twoBox", 1L)
            .put("hits", 1L).put("hitRate", 100.0)
            .put("oneBoxPct", 0.0).put("twoBoxPct", 100.0)
            .put("avgOnePayoff", 0L).put("avgTwoPayoff", 1000L);
        when(mockService.submit(eq("two"), eq("two"), eq(true), eq(1000)))
            .thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("choice", "two")
                .put("prediction", "two")
                .put("hit", true)
                .put("payoff", 1000))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                assertEquals(200, res.bodyAsJsonObject().getInteger("status"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_choice_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("choice", "three"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_prediction_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("prediction", "maybe"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_hit_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("choice", "one")
            .put("prediction", "one")
            .put("payoff", 1000000);
        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_negative_payoff_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("payoff", -100))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_payoff_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("choice", "one")
            .put("prediction", "one")
            .put("hit", true);
        client.post(port, "localhost", "/newcomb/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_returns_data(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("total", 200L)
            .put("oneBox", 120L)
            .put("twoBox", 80L)
            .put("hits", 170L)
            .put("hitRate", 85.0)
            .put("oneBoxPct", 60.0)
            .put("twoBoxPct", 40.0)
            .put("avgOnePayoff", 850000L)
            .put("avgTwoPayoff", 2000L);
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/newcomb/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                JsonObject data = body.getJsonObject("data");
                assertEquals(200L, data.getLong("total"));
                assertEquals(120L, data.getLong("oneBox"));
                assertEquals(85.0, data.getDouble("hitRate"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_unknown_path_returns_404(VertxTestContext ctx) {
        client.get(port, "localhost", "/newcomb/unknown")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(404, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
