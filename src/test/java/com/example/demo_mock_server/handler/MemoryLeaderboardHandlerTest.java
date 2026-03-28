package com.example.demo_mock_server.handler;

import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.HttpResponse;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class MemoryLeaderboardHandlerTest {

    private int port;

    @BeforeEach
    void setup(Vertx vertx, VertxTestContext testContext) {
        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        MemoryLeaderboardHandler handler = new MemoryLeaderboardHandler();
        router.get("/memory-challenge/leaderboard").handler(handler);
        router.post("/memory-challenge/leaderboard").handler(handler);

        vertx.createHttpServer()
            .requestHandler(router)
            .listen(0)
            .onSuccess(server -> {
                port = server.actualPort();
                testContext.completeNow();
            })
            .onFailure(testContext::failNow);
    }

    @Test
    void submitAndFetchLeaderboardShouldReturnRankedOrder(Vertx vertx, VertxTestContext testContext) {
        WebClient client = WebClient.create(vertx);

        JsonObject alice = new JsonObject()
            .put("name", "Alice")
            .put("capacity", 7)
            .put("history", new JsonArray().add(new JsonObject().put("n", 7).put("accuracy", 85)));
        JsonObject bob = new JsonObject()
            .put("name", "Bob")
            .put("capacity", 9)
            .put("history", new JsonArray().add(new JsonObject().put("n", 9).put("accuracy", 70)));
        JsonObject cindy = new JsonObject()
            .put("name", "Cindy")
            .put("capacity", 9)
            .put("history", new JsonArray().add(new JsonObject().put("n", 9).put("accuracy", 95)));

        postScore(client, bob)
            .compose(ignore -> postScore(client, alice))
            .compose(ignore -> postScore(client, cindy))
            .compose(ignore -> client.get(port, "localhost", "/memory-challenge/leaderboard?limit=3").send())
            .onSuccess(response -> {
                testContext.verify(() -> {
                    JsonObject body = response.bodyAsJsonObject();
                    assertEquals(200, body.getInteger("status"));
                    JsonArray leaders = body.getJsonObject("data").getJsonArray("leaders");
                    assertEquals(3, leaders.size());
                    assertEquals("Cindy", leaders.getJsonObject(0).getString("name"));
                    assertEquals("Bob", leaders.getJsonObject(1).getString("name"));
                    assertEquals("Alice", leaders.getJsonObject(2).getString("name"));
                    assertEquals(1, leaders.getJsonObject(0).getInteger("rank"));
                });
                testContext.completeNow();
            })
            .onFailure(testContext::failNow);
    }

    @Test
    void submitWithoutNameShouldReturnBadRequest(Vertx vertx, VertxTestContext testContext) {
        WebClient client = WebClient.create(vertx);
        JsonObject payload = new JsonObject()
            .put("capacity", 6)
            .put("history", new JsonArray().add(new JsonObject().put("n", 6).put("accuracy", 90)));

        client.post(port, "localhost", "/memory-challenge/leaderboard")
            .sendJsonObject(payload)
            .onSuccess(response -> {
                testContext.verify(() -> {
                    assertEquals(400, response.statusCode());
                    JsonObject body = response.bodyAsJsonObject();
                    assertEquals(400, body.getInteger("status"));
                    assertTrue(body.getString("message").contains("name"));
                });
                testContext.completeNow();
            })
            .onFailure(testContext::failNow);
    }

    private Future<HttpResponse<Buffer>> postScore(WebClient client, JsonObject payload) {
        return client.post(port, "localhost", "/memory-challenge/leaderboard")
            .sendJsonObject(payload)
            .compose(response -> {
                if (response.statusCode() != 200) {
                    return Future.failedFuture("unexpected status: " + response.statusCode());
                }
                return Future.succeededFuture(response);
            });
    }
}
