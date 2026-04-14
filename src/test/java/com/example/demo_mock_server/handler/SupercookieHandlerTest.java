package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class SupercookieHandlerTest {

    private static int port;
    private static HttpServer server;
    private static WebClient client;

    @BeforeAll
    static void setup(Vertx vertx, VertxTestContext ctx) {
        SupercookieHandler handler = new SupercookieHandler(new SupercookieService());
        Router router = Router.router(vertx);
        router.post("/supercookie/session").handler(handler);
        router.get("/supercookie/pixel").handler(handler);
        router.get("/supercookie/stats").handler(handler);

        server = vertx.createHttpServer();
        client = WebClient.create(vertx);
        server.requestHandler(router).listen(0, ar -> {
            if (ar.succeeded()) { port = ar.result().actualPort(); ctx.completeNow(); }
            else ctx.failNow(ar.cause());
        });
    }

    @AfterAll
    static void teardown(VertxTestContext ctx) {
        if (server != null) server.close(ar -> ctx.completeNow());
        else ctx.completeNow();
    }

    @Test
    void testCreateSession(Vertx vertx, VertxTestContext ctx) {
        client.post(port, "localhost", "/supercookie/session").send(ar -> {
            ctx.verify(() -> {
                assertEquals(200, ar.result().statusCode());
                JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                assertNotNull(data.getInteger("trackingId"));
                assertEquals(16, data.getString("binary").length());
                assertEquals(16, data.getJsonArray("bits").size());
            });
            ctx.completeNow();
        });
    }

    @Test
    void testFaviconReturnsLongCache(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/pixel").send(ar -> {
            ctx.verify(() -> {
                assertEquals(200, ar.result().statusCode());
                assertEquals("image/png", ar.result().getHeader("Content-Type"));
                assertTrue(ar.result().getHeader("Cache-Control").contains("max-age=5"));
            });
            ctx.completeNow();
        });
    }

    @Test
    void testStats(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/stats").send(ar -> {
            ctx.verify(() -> {
                assertEquals(200, ar.result().statusCode());
                JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                assertEquals(16, data.getInteger("bits"));
                assertEquals(65536, data.getInteger("maxCapacity"));
            });
            ctx.completeNow();
        });
    }
}
