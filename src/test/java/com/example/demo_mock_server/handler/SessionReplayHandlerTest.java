package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.SessionReplayService;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(VertxExtension.class)
class SessionReplayHandlerTest {

    private int port;
    private SessionReplayService mockService;

    @BeforeEach
    void setup(Vertx vertx, VertxTestContext ctx) {
        mockService = mock(SessionReplayService.class);

        when(mockService.submit(any())).thenReturn(Future.succeededFuture(
            new JsonObject().put("ok", true).put("sessionId", "11111111-1111-1111-1111-111111111111")
        ));

        when(mockService.stats()).thenReturn(Future.succeededFuture(
            new JsonObject()
                .put("global", new JsonObject().put("totalSessions", 3))
                .put("recent", new JsonArray())
        ));

        when(mockService.getSession(eq("11111111-1111-1111-1111-111111111111"))).thenReturn(Future.succeededFuture(
            new JsonObject()
                .put("sessionId", "11111111-1111-1111-1111-111111111111")
                .put("eventCount", 2)
                .put("events", new JsonArray().add(new JsonObject().put("type", "focus")))
        ));

        SessionReplayHandler handler = new SessionReplayHandler(mockService);
        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.post("/session-replay/submit").handler(handler);
        router.get("/session-replay/stats").handler(handler);
        router.get("/session-replay/session/:sessionId").handler(handler);

        vertx.createHttpServer().requestHandler(router).listen(0)
            .onSuccess(server -> {
                port = server.actualPort();
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void submitShouldReturn200(Vertx vertx, VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sessionId", "11111111-1111-1111-1111-111111111111")
            .put("questionCount", 5)
            .put("durationMs", 12000)
            .put("typedChars", 18)
            .put("focusSwitches", 6)
            .put("maxScrollPct", 72.5)
            .put("answers", new JsonObject().put("dailyApp", "微信"))
            .put("events", new JsonArray()
                .add(new JsonObject().put("ts", 0).put("type", "focus").put("target", "dailyApp"))
                .add(new JsonObject().put("ts", 400).put("type", "input").put("target", "dailyApp").put("value", "微信"))
            );

        WebClient.create(vertx)
            .post(port, "localhost", "/session-replay/submit")
            .sendJsonObject(body)
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals(200, resp.bodyAsJsonObject().getInteger("status"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void submitShouldReturn400WhenSessionIdInvalid(Vertx vertx, VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("sessionId", "bad-id")
            .put("questionCount", 5)
            .put("durationMs", 12000)
            .put("typedChars", 18)
            .put("focusSwitches", 6)
            .put("maxScrollPct", 72.5)
            .put("answers", new JsonObject().put("dailyApp", "微信"))
            .put("events", new JsonArray().add(new JsonObject().put("ts", 0).put("type", "focus").put("target", "dailyApp")));

        WebClient.create(vertx)
            .post(port, "localhost", "/session-replay/submit")
            .sendJsonObject(body)
            .onSuccess(resp -> {
                ctx.verify(() -> assertEquals(400, resp.statusCode()));
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void statsShouldReturn200(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .get(port, "localhost", "/session-replay/stats")
            .send()
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals(3, resp.bodyAsJsonObject().getJsonObject("data").getJsonObject("global").getInteger("totalSessions"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void getSessionShouldReturn200(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .get(port, "localhost", "/session-replay/session/11111111-1111-1111-1111-111111111111")
            .send()
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals("11111111-1111-1111-1111-111111111111",
                        resp.bodyAsJsonObject().getJsonObject("data").getString("sessionId"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    static class TestableHandler extends SessionReplayHandler {
        TestableHandler() {
            super(mock(SessionReplayService.class));
        }
    }

    @Test
    void sanitizeShouldTrimAndTruncate() {
        TestableHandler handler = new TestableHandler();
        assertEquals("abc", handler.sanitize("  abc  ", 10));
        assertEquals("ab", handler.sanitize("abcd", 2));
        assertNull(handler.sanitize("   ", 10));
    }

    @Test
    void clampHelpersShouldClamp() {
        TestableHandler handler = new TestableHandler();
        assertEquals(3, handler.clampInt(3, 1, 5));
        assertEquals(1, handler.clampInt(0, 1, 5));
        assertEquals(5L, handler.clampLong(8L, 1L, 5L));
        assertEquals(1.5, handler.clampDouble(1.5, 0.0, 2.0));
    }
}
