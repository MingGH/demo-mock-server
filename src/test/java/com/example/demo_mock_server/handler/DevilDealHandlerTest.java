package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.DevilDealService;
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
class DevilDealHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private DevilDealService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(DevilDealService.class);

        // isValidType / isValidPct 不是 final，可以直接 mock
        when(mockService.isValidType(anyString())).thenCallRealMethod();
        when(mockService.isValidPct(any())).thenCallRealMethod();

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        DevilDealHandler handler = new DevilDealHandler(mockService);
        router.post("/devil-deal/submit").handler(handler);
        router.get("/devil-deal/stats").handler(handler);

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
            .put("dealType", "money")
            .put("secondType", "love")
            .put("powerPct", 30)
            .put("lovePct", 55)
            .put("moneyPct", 80)
            .put("revengePct", 10)
            .put("recognitionPct", 40)
            .put("knowledgePct", 25);
    }

    @Test
    void post_valid_returns_stats(VertxTestContext ctx) {
        JsonObject mockResult = new JsonObject()
            .put("sameCount", 15L)
            .put("total", 100L)
            .put("samePercent", 15.0);
        when(mockService.submit(
            eq("money"), eq("love"),
            eq(30), eq(55), eq(80), eq(10), eq(40), eq(25)
        )).thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody())
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                JsonObject data = body.getJsonObject("data");
                assertEquals(15L, data.getLong("sameCount"));
                assertEquals(100L, data.getLong("total"));
                assertEquals(15.0, data.getDouble("samePercent"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_deal_type_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("dealType", "invalid"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_pct_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("powerPct", 150))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_field_returns_400(VertxTestContext ctx) {
        JsonObject incomplete = new JsonObject()
            .put("dealType", "money")
            .put("secondType", "love");
        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(incomplete)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_returns_data(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("global", new JsonObject()
                .put("totalSessions", 200L)
                .put("avgPower", 35.2)
                .put("avgLove", 42.1)
                .put("avgMoney", 50.5)
                .put("avgRevenge", 18.3)
                .put("avgRecognition", 38.7)
                .put("avgKnowledge", 28.9))
            .put("typeDist", new JsonObject()
                .put("money", 50L)
                .put("love", 44L)
                .put("power", 36L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/devil-deal/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(200L, data.getJsonObject("global").getLong("totalSessions"));
                assertTrue(data.containsKey("typeDist"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(
            anyString(), anyString(),
            anyInt(), anyInt(), anyInt(), anyInt(), anyInt(), anyInt()
        )).thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody())
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_negative_pct_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/devil-deal/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("revengePct", -5))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
