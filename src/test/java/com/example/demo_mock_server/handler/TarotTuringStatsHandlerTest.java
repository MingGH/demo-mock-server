package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.TarotTuringStatsService;
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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class TarotTuringStatsHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private TarotTuringStatsService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(TarotTuringStatsService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        TarotTuringStatsHandler handler = new TarotTuringStatsHandler(mockService);
        router.post("/tarot-turing-test/submit").handler(handler);
        router.get("/tarot-turing-test/stats").handler(handler);

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
            .put("sessionSeed", "seed_123456")
            .put("spreadId", "career-crossroad")
            .put("bestSlot", "B")
            .put("bestRole", "ai")
            .put("guessedAiSlot", "C")
            .put("guessedAiRole", "human")
            .put("guessedAiCorrect", false);
    }

    @Test
    void post_valid_submits_success(VertxTestContext ctx) {
        when(mockService.submit(
            eq("seed_123456"),
            eq("career-crossroad"),
            eq("B"),
            eq("ai"),
            eq("C"),
            eq("human"),
            eq(false)
        )).thenReturn(Future.succeededFuture());

        client.post(port, "localhost", "/tarot-turing-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody())
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                assertTrue(body.getJsonObject("data").getBoolean("submitted"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_slot_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/tarot-turing-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("bestSlot", "D"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_role_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/tarot-turing-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody().put("guessedAiRole", "robot"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_boolean_returns_400(VertxTestContext ctx) {
        JsonObject body = validBody();
        body.remove("guessedAiCorrect");
        client.post(port, "localhost", "/tarot-turing-test/submit")
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
            .put("totalSessions", 12L)
            .put("guessAiAccuracyPct", 41.7)
            .put("bestRoleCounts", new JsonObject()
                .put("template", 2L)
                .put("human", 4L)
                .put("ai", 6L))
            .put("guessedAiRoleCounts", new JsonObject()
                .put("template", 5L)
                .put("human", 2L)
                .put("ai", 5L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/tarot-turing-test/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(12L, data.getLong("totalSessions"));
                assertEquals(41.7, data.getDouble("guessAiAccuracyPct"));
                assertTrue(data.getJsonObject("bestRoleCounts") != null);
                assertTrue(data.getJsonObject("guessedAiRoleCounts") != null);
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(
            anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyBoolean()
        )).thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/tarot-turing-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(validBody())
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
