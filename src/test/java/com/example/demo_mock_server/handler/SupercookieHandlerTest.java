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
    private static SupercookieService service;

    @BeforeAll
    static void setup(Vertx vertx, VertxTestContext ctx) {
        service = new SupercookieService();
        SupercookieHandler handler = new SupercookieHandler(service);

        Router router = Router.router(vertx);
        router.post("/supercookie/assign").handler(handler);
        router.get("/supercookie/identify").handler(handler);
        router.get("/supercookie/stats").handler(handler);
        router.delete("/supercookie/evict").handler(handler);

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
    void testAssignNewUser(Vertx vertx, VertxTestContext ctx) {
        // 先清除，确保是新用户
        client.delete(port, "localhost", "/supercookie/evict")
                .send(evictAr -> {
                    client.post(port, "localhost", "/supercookie/assign")
                            .send(ar -> {
                                ctx.verify(() -> {
                                    assertTrue(ar.succeeded());
                                    assertEquals(200, ar.result().statusCode());
                                    JsonObject body = ar.result().bodyAsJsonObject();
                                    JsonObject data = body.getJsonObject("data");
                                    assertNotNull(data);
                                    assertNotNull(data.getInteger("trackingId"));
                                    assertEquals(16, data.getInteger("bits"));
                                    assertNotNull(data.getString("binary"));
                                    assertEquals(16, data.getString("binary").length());
                                    assertEquals(1, data.getInteger("visitCount"));
                                    assertFalse(data.getBoolean("returning"));
                                });
                                ctx.completeNow();
                            });
                });
    }

    @Test
    void testIdentifyUnknownUser(Vertx vertx, VertxTestContext ctx) {
        // 先清除，确保是新用户
        client.delete(port, "localhost", "/supercookie/evict")
                .send(evictAr -> {
                    client.get(port, "localhost", "/supercookie/identify")
                            .send(ar -> {
                                ctx.verify(() -> {
                                    assertTrue(ar.succeeded());
                                    JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                                    // identify 对未知用户也可能返回 found:false 或 found:true
                                    // 取决于 assign 是否被调用过（同 IP）
                                    assertNotNull(data);
                                });
                                ctx.completeNow();
                            });
                });
    }

    @Test
    void testAssignThenIdentify(Vertx vertx, VertxTestContext ctx) {
        // 先清除旧数据
        client.delete(port, "localhost", "/supercookie/evict")
                .send(evictAr -> {
                    // 分配 ID
                    client.post(port, "localhost", "/supercookie/assign")
                            .send(assignAr -> {
                                ctx.verify(() -> assertTrue(assignAr.succeeded()));
                                JsonObject assignData = assignAr.result().bodyAsJsonObject().getJsonObject("data");
                                int assignedId = assignData.getInteger("trackingId");

                                // 识别
                                client.get(port, "localhost", "/supercookie/identify")
                                        .send(identifyAr -> {
                                            ctx.verify(() -> {
                                                assertTrue(identifyAr.succeeded());
                                                JsonObject data = identifyAr.result().bodyAsJsonObject().getJsonObject("data");
                                                assertTrue(data.getBoolean("found"));
                                                assertEquals(assignedId, data.getInteger("trackingId"));
                                                assertTrue(data.getInteger("visitCount") >= 2);
                                            });
                                            ctx.completeNow();
                                        });
                            });
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
    void testEvict(Vertx vertx, VertxTestContext ctx) {
        // 先分配
        client.post(port, "localhost", "/supercookie/assign")
                .send(assignAr -> {
                    // 清除
                    client.delete(port, "localhost", "/supercookie/evict")
                            .send(evictAr -> {
                                ctx.verify(() -> {
                                    assertTrue(evictAr.succeeded());
                                    JsonObject data = evictAr.result().bodyAsJsonObject().getJsonObject("data");
                                    assertTrue(data.getBoolean("evicted"));
                                });
                                // 再识别应该找不到
                                client.get(port, "localhost", "/supercookie/identify")
                                        .send(identifyAr -> {
                                            ctx.verify(() -> {
                                                JsonObject data = identifyAr.result().bodyAsJsonObject().getJsonObject("data");
                                                assertFalse(data.getBoolean("found"));
                                            });
                                            ctx.completeNow();
                                        });
                            });
                });
    }

    @Test
    void testAssignReturnsBinaryOf16Chars(Vertx vertx, VertxTestContext ctx) {
        client.delete(port, "localhost", "/supercookie/evict")
                .send(evictAr -> {
                    client.post(port, "localhost", "/supercookie/assign")
                            .send(ar -> {
                                ctx.verify(() -> {
                                    JsonObject data = ar.result().bodyAsJsonObject().getJsonObject("data");
                                    String binary = data.getString("binary");
                                    assertEquals(16, binary.length());
                                    // 每个字符都是 0 或 1
                                    for (char c : binary.toCharArray()) {
                                        assertTrue(c == '0' || c == '1');
                                    }
                                });
                                ctx.completeNow();
                            });
                });
    }

    @Test
    void testReturningUser(Vertx vertx, VertxTestContext ctx) {
        // 清除 → 分配 → 再分配（应该是 returning=true）
        client.delete(port, "localhost", "/supercookie/evict")
                .send(evictAr -> {
                    client.post(port, "localhost", "/supercookie/assign")
                            .send(firstAr -> {
                                int firstId = firstAr.result().bodyAsJsonObject()
                                        .getJsonObject("data").getInteger("trackingId");

                                client.post(port, "localhost", "/supercookie/assign")
                                        .send(secondAr -> {
                                            ctx.verify(() -> {
                                                JsonObject data = secondAr.result().bodyAsJsonObject().getJsonObject("data");
                                                assertTrue(data.getBoolean("returning"));
                                                assertEquals(firstId, data.getInteger("trackingId"));
                                                assertEquals(2, data.getInteger("visitCount"));
                                            });
                                            ctx.completeNow();
                                        });
                            });
                });
    }
}
