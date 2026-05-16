package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.NimGameStatsService;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class NimGameStatsHandlerTest {

    private static HttpServer server;
    private static WebClient client;
    private static NimGameStatsService mockService;
    private static int port;

    @BeforeAll
    static void setup(Vertx vertx, VertxTestContext ctx) {
        mockService = Mockito.mock(NimGameStatsService.class);
        NimGameStatsHandler handler = new NimGameStatsHandler(mockService);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.post("/nim-game/submit").handler(handler);
        router.get("/nim-game/stats").handler(handler);

        server = vertx.createHttpServer();
        server.requestHandler(router).listen(0, ctx.succeeding(s -> {
            port = s.actualPort();
            client = WebClient.create(vertx);
            ctx.completeNow();
        }));
    }

    @AfterAll
    static void teardown(VertxTestContext ctx) {
        if (server != null) server.close(ctx.succeeding(v -> ctx.completeNow()));
        else ctx.completeNow();
    }

    @Test
    void testSubmitSuccess(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("total", 10)
            .put("playerWins", 3)
            .put("aiWins", 7)
            .put("aiWinRate", 70.0)
            .put("aiWinRateHard", 90.0)
            .put("gamesEasy", 2)
            .put("gamesNormal", 3)
            .put("gamesHard", 5);

        when(mockService.submit(eq("lose"), eq("hard"), eq(8), eq("classic")))
            .thenReturn(Future.succeededFuture(mockData));

        JsonObject body = new JsonObject()
            .put("result", "lose")
            .put("difficulty", "hard")
            .put("rounds", 8)
            .put("preset", "classic");

        client.post(port, "localhost", "/nim-game/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    assertEquals(10, json.getJsonObject("data").getInteger("total"));
                    assertEquals(70.0, json.getJsonObject("data").getDouble("aiWinRate"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitInvalidResult(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("result", "draw")
            .put("difficulty", "hard")
            .put("rounds", 5)
            .put("preset", "classic");

        client.post(port, "localhost", "/nim-game/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid result"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitInvalidDifficulty(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("result", "win")
            .put("difficulty", "impossible")
            .put("rounds", 5)
            .put("preset", "classic");

        client.post(port, "localhost", "/nim-game/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid difficulty"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitInvalidRounds(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("result", "win")
            .put("difficulty", "easy")
            .put("rounds", 0)
            .put("preset", "classic");

        client.post(port, "localhost", "/nim-game/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid rounds"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testGetStats(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("total", 50)
            .put("playerWins", 12)
            .put("aiWins", 38)
            .put("aiWinRate", 76.0)
            .put("aiWinRateHard", 95.0)
            .put("gamesEasy", 10)
            .put("gamesNormal", 15)
            .put("gamesHard", 25);

        when(mockService.getStats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/nim-game/stats")
            .send(ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    JsonObject data = json.getJsonObject("data");
                    assertEquals(50, data.getInteger("total"));
                    assertEquals(38, data.getInteger("aiWins"));
                    assertEquals(95.0, data.getDouble("aiWinRateHard"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitPlayerWin(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("total", 1)
            .put("playerWins", 1)
            .put("aiWins", 0)
            .put("aiWinRate", 0.0)
            .put("aiWinRateHard", 0.0)
            .put("gamesEasy", 1)
            .put("gamesNormal", 0)
            .put("gamesHard", 0);

        when(mockService.submit(eq("win"), eq("easy"), eq(3), eq("random")))
            .thenReturn(Future.succeededFuture(mockData));

        JsonObject body = new JsonObject()
            .put("result", "win")
            .put("difficulty", "easy")
            .put("rounds", 3)
            .put("preset", "random");

        client.post(port, "localhost", "/nim-game/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject data = resp.bodyAsJsonObject().getJsonObject("data");
                    assertEquals(1, data.getInteger("playerWins"));
                });
                ctx.completeNow();
            }));
    }
}
