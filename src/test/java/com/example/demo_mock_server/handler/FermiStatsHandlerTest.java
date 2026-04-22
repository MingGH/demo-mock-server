package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.FermiStatsService;
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
class FermiStatsHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private FermiStatsService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(FermiStatsService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        FermiStatsHandler handler = new FermiStatsHandler(mockService);
        router.post("/fermi/submit").handler(handler);
        router.get("/fermi/stats").handler(handler);

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
            .put("rank", 7L)
            .put("totalSessions", 100L)
            .put("percentile", 93.0);
        when(mockService.submit(eq(0.85), eq(7), eq("B")))
            .thenReturn(Future.succeededFuture(mockResult));

        client.post(port, "localhost", "/fermi/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("avgOOM", 0.85)
                .put("withinOOM", 7)
                .put("grade", "B"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                assertEquals(200, body.getInteger("status"));
                assertEquals(7L, body.getJsonObject("data").getLong("rank"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_grade_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/fermi/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("avgOOM", 0.85)
                .put("withinOOM", 7))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_invalid_avgOOM_returns_400(VertxTestContext ctx) {
        client.post(port, "localhost", "/fermi/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("avgOOM", 99.0)
                .put("withinOOM", 7)
                .put("grade", "B"))
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
                .put("avgOOM", 0.92)
                .put("avgWithinOOM", 6.3))
            .put("gradeDist", new JsonObject()
                .put("S", 5L).put("A", 40L).put("B", 90L).put("C", 50L).put("D", 15L));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/fermi/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(200L, data.getJsonObject("global").getLong("totalSessions"));
                assertTrue(data.containsKey("gradeDist"));
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(anyDouble(), anyInt(), anyString()))
            .thenReturn(Future.failedFuture("DB down"));

        client.post(port, "localhost", "/fermi/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(new JsonObject()
                .put("avgOOM", 0.85)
                .put("withinOOM", 7)
                .put("grade", "B"))
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
