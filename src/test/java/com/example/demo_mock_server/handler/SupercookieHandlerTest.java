package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SupercookieService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonArray;
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
        SupercookieService service = new SupercookieService();
        SupercookieHandler handler = new SupercookieHandler(service);

        Router router = Router.router(vertx);
        router.post("/supercookie/session").handler(handler);
        router.get("/supercookie/favicon/:bit").handler(handler);
        router.post("/supercookie/probe-session").handler(handler);
        router.get("/supercookie/probe/:bit").handler(handler);
        router.get("/supercookie/resolve").handler(handler);
        router.get("/supercookie/stats").handler(handler);

        server = vertx.createHttpServer();
        client = WebClient.create(vertx);

        server.requestHandler(router).listen(0, ar -> {
            if (ar.succeeded()) {
                port = ar.result().actualPort();
                ctx.completeNow();
            } else {
                ctx.failNow(ar.cause());
            }
        });
    }

    @AfterAll
    static void teardown(VertxTestContext ctx) {
        if (server != null) {
            server.close(ar -> ctx.completeNow());
        } else {
            ctx.completeNow();
        }
    }

    @Test
    void testCreateSession(Vertx vertx, VertxTestContext ctx) {
        client.post(port, "localhost", "/supercookie/session")
                .send(ar -> {
                    ctx.verify(() -> {
                        assertTrue(ar.succeeded());
                        assertEquals(200, ar.result().statusCode());
                        JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                        assertNotNull(data.getString("token"));
                        assertNotNull(data.getInteger("trackingId"));
                        assertEquals(16, data.getString("binary").length());
                        assertEquals(16, data.getJsonArray("bits").size());
                    });
                    ctx.completeNow();
                });
    }

    @Test
    void testFaviconWithValidToken(Vertx vertx, VertxTestContext ctx) {
        client.post(port, "localhost", "/supercookie/session")
                .send(sessionAr -> {
                    ctx.verify(() -> assertTrue(sessionAr.succeeded()));
                    String token = sessionAr.result().bodyAsJsonObject()
                            .getJsonObject("data").getString("token");

                    client.get(port, "localhost", "/supercookie/favicon/0?token=" + token)
                            .send(ar -> {
                                ctx.verify(() -> {
                                    assertTrue(ar.succeeded());
                                    assertEquals(200, ar.result().statusCode());
                                    assertEquals("image/png", ar.result().getHeader("Content-Type"));
                                    // Should have cache control header
                                    assertNotNull(ar.result().getHeader("Cache-Control"));
                                });
                                ctx.completeNow();
                            });
                });
    }

    @Test
    void testFaviconWithInvalidToken(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/favicon/0?token=invalid")
                .send(ar -> {
                    ctx.verify(() -> {
                        assertTrue(ar.succeeded());
                        assertEquals(404, ar.result().statusCode());
                    });
                    ctx.completeNow();
                });
    }

    @Test
    void testProbeAndResolve(Vertx vertx, VertxTestContext ctx) {
        // Create write session first
        client.post(port, "localhost", "/supercookie/session")
                .send(sessionAr -> {
                    JsonObject sessionData = sessionAr.result().bodyAsJsonObject().getJsonObject("data");
                    int trackingId = sessionData.getInteger("trackingId");
                    JsonArray bits = sessionData.getJsonArray("bits");

                    // Create probe session
                    client.post(port, "localhost", "/supercookie/probe-session")
                            .send(probeAr -> {
                                String probeToken = probeAr.result().bodyAsJsonObject()
                                        .getJsonObject("data").getString("token");

                                // Simulate probe hits for bit=0 positions
                                // (requests that reach server = no cache = bit 0)
                                int[] zeroBits = new int[16];
                                int count = 0;
                                for (int i = 0; i < 16; i++) {
                                    if (bits.getInteger(i) == 0) {
                                        zeroBits[count++] = i;
                                    }
                                }

                                // Send probe requests for zero bits
                                final int totalZeros = count;
                                if (totalZeros == 0) {
                                    // All bits are 1, resolve directly
                                    resolveAndVerify(ctx, probeToken, trackingId);
                                    return;
                                }

                                final int[] completed = {0};
                                for (int j = 0; j < totalZeros; j++) {
                                    int bitIdx = zeroBits[j];
                                    client.get(port, "localhost",
                                                    "/supercookie/probe/" + bitIdx + "?token=" + probeToken)
                                            .send(pAr -> {
                                                synchronized (completed) {
                                                    completed[0]++;
                                                    if (completed[0] == totalZeros) {
                                                        resolveAndVerify(ctx, probeToken, trackingId);
                                                    }
                                                }
                                            });
                                }
                            });
                });
    }

    private void resolveAndVerify(VertxTestContext ctx, String probeToken, int expectedId) {
        client.get(port, "localhost", "/supercookie/resolve?token=" + probeToken)
                .send(resolveAr -> {
                    ctx.verify(() -> {
                        assertTrue(resolveAr.succeeded());
                        JsonObject data = resolveAr.result().bodyAsJsonObject().getJsonObject("data");
                        assertTrue(data.getBoolean("found"));
                        assertEquals(expectedId, data.getInteger("trackingId").intValue());
                    });
                    ctx.completeNow();
                });
    }

    @Test
    void testStats(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/stats")
                .send(ar -> {
                    ctx.verify(() -> {
                        assertTrue(ar.succeeded());
                        assertEquals(200, ar.result().statusCode());
                        JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                        assertNotNull(data.getLong("trackedUsers"));
                        assertEquals(16, data.getInteger("bits"));
                        assertEquals(65536, data.getInteger("maxCapacity"));
                    });
                    ctx.completeNow();
                });
    }

    @Test
    void testResolveWithExpiredToken(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/resolve?token=nonexistent")
                .send(ar -> {
                    ctx.verify(() -> {
                        assertTrue(ar.succeeded());
                        JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                        assertFalse(data.getBoolean("found"));
                    });
                    ctx.completeNow();
                });
    }
}
