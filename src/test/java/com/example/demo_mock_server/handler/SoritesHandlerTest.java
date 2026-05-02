package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SoritesService;
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
class SoritesHandlerTest {

    private Vertx vertx;
    private WebClient client;
    private int port;
    private SoritesService mockService;

    @BeforeEach
    void setUp(VertxTestContext ctx) {
        vertx = Vertx.vertx();
        mockService = Mockito.mock(SoritesService.class);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        SoritesHandler handler = new SoritesHandler(mockService);
        router.post("/sorites/submit").handler(handler);
        router.get("/sorites/stats").handler(handler);

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
        when(mockService.submit(eq(1500), eq("sharp"), eq(5000), eq(45)))
            .thenReturn(Future.succeededFuture());

        JsonObject body = new JsonObject()
            .put("sandBoundary", 1500)
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 5000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
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
    void post_missing_sandBoundary_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 5000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_missing_sandSharpness_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sandBoundary", 1500)
            .put("baldBoundary", 5000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_sandBoundary_out_of_range_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sandBoundary", 20000)
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 5000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_baldBoundary_out_of_range_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sandBoundary", 1500)
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 200000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_colorBoundary_out_of_range_returns_400(VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sandBoundary", 1500)
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 5000)
            .put("colorBoundary", 150);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(400, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.submit(anyInt(), anyString(), anyInt(), anyInt()))
            .thenReturn(Future.failedFuture("DB down"));

        JsonObject body = new JsonObject()
            .put("sandBoundary", 1500)
            .put("sandSharpness", "sharp")
            .put("baldBoundary", 5000)
            .put("colorBoundary", 45);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_returns_data(VertxTestContext ctx) {
        JsonObject mockData = new JsonObject()
            .put("totalCount", 100L)
            .put("sandMean", 2000L)
            .put("baldMean", 8000L)
            .put("colorMean", 48L)
            .put("sandMedian", 1800)
            .put("baldMedian", 7500)
            .put("colorMedian", 50)
            .put("sandDistribution", new JsonArray()
                .add(new JsonObject().put("label", "0-1000").put("count", 20))
                .add(new JsonObject().put("label", "1000-2000").put("count", 35)))
            .put("baldDistribution", new JsonArray()
                .add(new JsonObject().put("label", "0-10000").put("count", 15)))
            .put("colorDistribution", new JsonArray()
                .add(new JsonObject().put("label", "0-10").put("count", 5)));
        when(mockService.stats()).thenReturn(Future.succeededFuture(mockData));

        client.get(port, "localhost", "/sorites/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                JsonObject body = res.bodyAsJsonObject();
                JsonObject data = body.getJsonObject("data");
                assertEquals(100L, data.getLong("totalCount"));
                assertEquals(2000L, data.getLong("sandMean"));
                assertTrue(data.getJsonArray("sandDistribution") != null);
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_stats_service_failure_returns_500(VertxTestContext ctx) {
        when(mockService.stats()).thenReturn(Future.failedFuture("DB down"));

        client.get(port, "localhost", "/sorites/stats")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(500, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void get_wrong_path_returns_404(VertxTestContext ctx) {
        client.get(port, "localhost", "/sorites/unknown")
            .send()
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(404, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }

    @Test
    void post_boundary_minus_one_is_valid(VertxTestContext ctx) {
        when(mockService.submit(eq(-1), eq("extreme-yes"), eq(0), eq(50)))
            .thenReturn(Future.succeededFuture());

        JsonObject body = new JsonObject()
            .put("sandBoundary", -1)
            .put("sandSharpness", "extreme-yes")
            .put("baldBoundary", 0)
            .put("colorBoundary", 50);

        client.post(port, "localhost", "/sorites/submit")
            .putHeader("Content-Type", "application/json")
            .sendJsonObject(body)
            .onSuccess(res -> ctx.verify(() -> {
                assertEquals(200, res.statusCode());
                ctx.completeNow();
            })).onFailure(ctx::failNow);
    }
}
