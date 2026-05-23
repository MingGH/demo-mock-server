package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.WinningStrategyStatsService;
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
class WinningStrategyStatsHandlerTest {

    private static HttpServer server;
    private static WebClient client;
    private static WinningStrategyStatsService mockService;
    private static int port;

    @BeforeAll
    static void setup(Vertx vertx, VertxTestContext ctx) {
        mockService = Mockito.mock(WinningStrategyStatsService.class);
        WinningStrategyStatsHandler handler = new WinningStrategyStatsHandler(mockService);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.post("/winning-strategy/submit").handler(handler);
        router.get("/winning-strategy/stats").handler(handler);

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
            .put("total", 1)
            .put("playerWins", 1)
            .put("aiWins", 0)
            .put("aiWinRate", 0.0)
            .put("gamesBash", 1)
            .put("gamesWythoff", 0)
            .put("gamesCoin", 0)
            .put("aiWinsHard", 0)
            .put("aiWinsBash", 0)
            .put("aiWinsWythoff", 0)
            .put("aiWinsCoin", 0);

        when(mockService.submit(eq("bash"), eq("win"), eq("hard"), eq(5)))
            .thenReturn(Future.succeededFuture(mockData));

        JsonObject body = new JsonObject()
            .put("game", "bash")
            .put("result", "win")
            .put("difficulty", "hard")
            .put("rounds", 5);

        client.post(port, "localhost", "/winning-strategy/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    assertEquals(1, json.getJsonObject("data").getInteger("total"));
                    assertEquals(1, json.getJsonObject("data").getInteger("playerWins"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitMissingField(VertxTestContext ctx) {
        // Missing "game" field
        JsonObject body = new JsonObject()
            .put("result", "win")
            .put("difficulty", "hard")
            .put("rounds", 5);

        client.post(port, "localhost", "/winning-strategy/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid game"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitInvalidGame(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("game", "chess")
            .put("result", "win")
            .put("difficulty", "hard")
            .put("rounds", 5);

        client.post(port, "localhost", "/winning-strategy/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid game"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testSubmitInvalidResult(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("game", "bash")
            .put("result", "draw")
            .put("difficulty", "hard")
            .put("rounds", 5);

        client.post(port, "localhost", "/winning-strategy/submit")
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
            .put("game", "wythoff")
            .put("result", "lose")
            .put("difficulty", "impossible")
            .put("rounds", 5);

        client.post(port, "localhost", "/winning-strategy/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("invalid difficulty"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testGetStatsSuccess(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("total", 100)
            .put("playerWins", 30)
            .put("aiWins", 70)
            .put("aiWinRate", 70.0)
            .put("gamesBash", 40)
            .put("gamesWythoff", 35)
            .put("gamesCoin", 25)
            .put("aiWinsHard", 50)
            .put("aiWinsBash", 25)
            .put("aiWinsWythoff", 30)
            .put("aiWinsCoin", 15);

        when(mockService.getStats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/winning-strategy/stats")
            .send(ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    JsonObject data = json.getJsonObject("data");
                    assertEquals(100, data.getInteger("total"));
                    assertEquals(70, data.getInteger("aiWins"));
                    assertEquals(70.0, data.getDouble("aiWinRate"));
                });
                ctx.completeNow();
            }));
    }

    @Test
    void testServiceErrorReturns500(VertxTestContext ctx) {
        when(mockService.submit(eq("coin"), eq("lose"), eq("normal"), eq(3)))
            .thenReturn(Future.failedFuture(new RuntimeException("DB connection failed")));

        JsonObject body = new JsonObject()
            .put("game", "coin")
            .put("result", "lose")
            .put("difficulty", "normal")
            .put("rounds", 3);

        client.post(port, "localhost", "/winning-strategy/submit")
            .sendJsonObject(body, ctx.succeeding(resp -> {
                ctx.verify(() -> {
                    assertEquals(500, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getString("message").contains("Internal error"));
                });
                ctx.completeNow();
            }));
    }
}
