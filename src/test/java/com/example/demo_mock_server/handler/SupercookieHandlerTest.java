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

import java.net.URI;

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
        router.get("/supercookie/launch").handler(handler);
        router.get("/supercookie/launch-icon").handler(handler);
        router.get("/supercookie/write").handler(handler);
        router.get("/supercookie/read").handler(handler);
        router.get("/supercookie/finalize").handler(handler);
        router.get("/supercookie/step").handler(handler);
        router.get("/supercookie/write-page").handler(handler);
        router.get("/supercookie/read-page").handler(handler);
        router.get("/favicon.ico").handler(handler);
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
    void testLaunchPageContainsLaunchIcon(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/launch?returnTo=http://localhost/demo").send(ar -> {
            ctx.verify(() -> {
                assertEquals(200, ar.result().statusCode());
                assertTrue(ar.result().bodyAsString().contains("/supercookie/launch-icon"));
            });
            ctx.completeNow();
        });
    }

    @Test
    void testLaunchIconSetsCookieAndReturnsLongCache(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/launch-icon").send(ar -> {
            ctx.verify(() -> {
                assertEquals(200, ar.result().statusCode());
                assertEquals("image/png", ar.result().getHeader("Content-Type"));
                assertTrue(ar.result().getHeader("Cache-Control").contains("max-age=31536000"));
                assertNotNull(ar.result().getHeader("Set-Cookie"));
                assertTrue(ar.result().getHeader("Set-Cookie").contains("sc_mid="));
            });
            ctx.completeNow();
        });
    }

    @Test
    void testReadModeFaviconReturns404NoStore(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/read?returnTo=http://localhost/demo").followRedirects(false).send(readAr -> {
            if (readAr.failed()) {
                ctx.failNow(readAr.cause());
                return;
            }

            String sessionCookie = cookieHeader(readAr.result().getHeader("Set-Cookie"));
            client.get(port, "bit0-numfeel.996.ninja", "/supercookie/step?returnTo=http://localhost/demo")
                    .putHeader("Cookie", sessionCookie)
                    .send(pageAr -> {
                if (pageAr.failed()) {
                    ctx.failNow(pageAr.cause());
                    return;
                }

                client.get(port, "bit0-numfeel.996.ninja", "/favicon.ico")
                        .putHeader("Cookie", sessionCookie)
                        .send(iconAr -> {
                    ctx.verify(() -> {
                        assertEquals(404, iconAr.result().statusCode());
                        assertEquals("no-store, max-age=0", iconAr.result().getHeader("Cache-Control"));
                    });
                    ctx.completeNow();
                });
            });
        });
    }

    @Test
    void testWriteModeFaviconReturnsCacheableIcon(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/launch-icon").send(iconAr -> {
            if (iconAr.failed()) {
                ctx.failNow(iconAr.cause());
                return;
            }

            String mid = cookieValue(iconAr.result().getHeader("Set-Cookie"));
            client.get(port, "localhost", "/supercookie/write?mid=" + mid + "&returnTo=http://localhost/demo").followRedirects(false).send(writeAr -> {
                if (writeAr.failed()) {
                    ctx.failNow(writeAr.cause());
                    return;
                }

                String sessionCookie = cookieHeader(writeAr.result().getHeader("Set-Cookie"));
                URI location = URI.create(writeAr.result().getHeader("Location"));
                String bitHost = location.getHost();
                String bitPath = location.getRawPath() + (location.getRawQuery() != null ? "?" + location.getRawQuery() : "");

                client.get(port, bitHost, bitPath).putHeader("Cookie", sessionCookie).send(pageAr -> {
                    if (pageAr.failed()) {
                        ctx.failNow(pageAr.cause());
                        return;
                    }

                    client.get(port, bitHost, "/favicon.ico").putHeader("Cookie", sessionCookie).send(faviconAr -> {
                        ctx.verify(() -> {
                            assertEquals(200, faviconAr.result().statusCode());
                            assertTrue(faviconAr.result().getHeader("Cache-Control").contains("immutable"));
                        });
                        ctx.completeNow();
                    });
                });
            });
        });
    }

    @Test
    void testFinalizeRedirectsBackWithTrackingId(Vertx vertx, VertxTestContext ctx) {
        client.get(port, "localhost", "/supercookie/launch-icon").send(iconAr -> {
            if (iconAr.failed()) {
                ctx.failNow(iconAr.cause());
                return;
            }

            String mid = cookieValue(iconAr.result().getHeader("Set-Cookie"));
            client.get(port, "localhost", "/supercookie/write?mid=" + mid + "&returnTo=http://localhost/demo").followRedirects(false).send(writeAr -> {
                if (writeAr.failed()) {
                    ctx.failNow(writeAr.cause());
                    return;
                }

                String sessionCookie = cookieHeader(writeAr.result().getHeader("Set-Cookie"));
                client.get(port, "localhost", "/supercookie/finalize?returnTo=http://localhost/demo")
                        .followRedirects(false)
                        .putHeader("Cookie", sessionCookie)
                        .send(finalAr -> {
                    ctx.verify(() -> {
                        assertEquals(302, finalAr.result().statusCode());
                        String location = finalAr.result().getHeader("Location");
                        assertTrue(location.startsWith("http://localhost/demo"));
                        assertTrue(location.contains("sc_action=written"));
                        assertTrue(location.contains("trackingId="));
                    });
                    ctx.completeNow();
                });
            });
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

    private static String cookieHeader(String setCookie) {
        assertNotNull(setCookie);
        return setCookie.split(";", 2)[0];
    }

    private static String cookieValue(String setCookie) {
        return cookieHeader(setCookie).split("=", 2)[1];
    }
}
