package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.BarnumStatsService;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class BarnumStatsHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private BarnumStatsService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(BarnumStatsService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        BarnumStatsHandler handler = new BarnumStatsHandler(mockService);
        router.post("/barnum-test/submit").handler(handler);
        router.get("/barnum-test/stats").handler(handler);

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
    void post_valid_submits_success(VertxTestContext ctx) {
        when(mockService.submit(eq("tarot"), eq(4), eq(5), eq(3), eq(4), eq(5)))
            .thenReturn(Future.succeededFuture());

        JsonObject body = new JsonObject()
            .put("userGroup", "tarot")
            .put("rating1", 4).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4)
            .put("rating5", 5);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject resp = res.bodyAsJsonObject();
                assertEquals(200, resp.getInteger("status"));
                assertTrue(resp.getJsonObject("data").getBoolean("submitted"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_random_group_submits_success(VertxTestContext ctx) {
        when(mockService.submit(eq("random"), eq(2), eq(3), eq(2), eq(4), eq(3)))
            .thenReturn(Future.succeededFuture());

        JsonObject body = new JsonObject()
            .put("userGroup", "random")
            .put("rating1", 2).put("rating2", 3)
            .put("rating3", 2).put("rating4", 4)
            .put("rating5", 3);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_userGroup_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("rating1", 4).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4)
            .put("rating5", 5);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_userGroup_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("userGroup", "invalid")
            .put("rating1", 4).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4)
            .put("rating5", 5);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_rating_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("userGroup", "tarot")
            .put("rating1", 4).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_rating_out_of_range_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("userGroup", "tarot")
            .put("rating1", 6).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4)
            .put("rating5", 5);

        client.post(port, "localhost", "/barnum-test/submit")
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
            .put("tarotAvg", 4.2)
            .put("randomAvg", 3.5)
            .put("tarotCount", 50L)
            .put("randomCount", 48L)
            .put("diff", 0.7)
            .put("diffPercent", 20)
            .put("tarotDistribution", new JsonArray().add(0).add(1).add(8).add(18).add(23))
            .put("randomDistribution", new JsonArray().add(2).add(5).add(16).add(15).add(10));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/barnum-test/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(4.2, data.getDouble("tarotAvg"), 0.001);
                assertEquals(3.5, data.getDouble("randomAvg"), 0.001);
                assertEquals(50L, data.getLong("tarotCount"));
                assertEquals(48L, data.getLong("randomCount"));
                assertTrue(data.getJsonArray("tarotDistribution") != null);
                assertTrue(data.getJsonArray("randomDistribution") != null);
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyInt(), anyInt()))
            .thenReturn(Future.failedFuture("DB down"));

        JsonObject body = new JsonObject()
            .put("userGroup", "tarot")
            .put("rating1", 4).put("rating2", 5)
            .put("rating3", 3).put("rating4", 4)
            .put("rating5", 5);

        client.post(port, "localhost", "/barnum-test/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_wrong_path_returns_404(VertxTestContext ctx) {
        client.get(port, "localhost", "/barnum-test/unknown")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(404, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
