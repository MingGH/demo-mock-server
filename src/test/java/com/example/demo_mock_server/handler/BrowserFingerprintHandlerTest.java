package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.FingerprintService;
import io.vertx.core.Future;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(VertxExtension.class)
class BrowserFingerprintHandlerTest {

    private int port;
    private FingerprintService mockService;

    @BeforeEach
    void setup(Vertx vertx, VertxTestContext ctx) {
        mockService = mock(FingerprintService.class);

        JsonObject collectResult = new JsonObject()
            .put("total", 42L)
            .put("sameHashCount", 3L)
            .put("lastSeenAt", 1700000000000L)
            .put("source", "mysql");
        when(mockService.collect(any())).thenReturn(Future.succeededFuture(collectResult));

        JsonObject statsResult = new JsonObject()
            .put("total", 100L)
            .put("uniqueFull", 80L)
            .put("avgVisits", 1.25);
        when(mockService.stats()).thenReturn(Future.succeededFuture(statsResult));

        BrowserFingerprintHandler handler = new BrowserFingerprintHandler(mockService);
        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.post("/fingerprint/collect").handler(handler);
        router.get("/fingerprint/stats").handler(handler);

        vertx.createHttpServer().requestHandler(router).listen(0)
            .onSuccess(s -> { port = s.actualPort(); ctx.completeNow(); })
            .onFailure(ctx::failNow);
    }

    @Test
    void collectShouldReturn200WithValidPayload(Vertx vertx, VertxTestContext ctx) {
        JsonObject body = new JsonObject()
            .put("fullHash", "a".repeat(64))
            .put("canvasHash", "b".repeat(64))
            .put("entropyBits", 52.2);

        WebClient.create(vertx)
            .post(port, "localhost", "/fingerprint/collect")
            .sendJsonObject(body)
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    assertEquals(42, json.getJsonObject("data").getInteger("total"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void collectShouldReturn400WhenFullHashMissing(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .post(port, "localhost", "/fingerprint/collect")
            .sendJsonObject(new JsonObject().put("canvasHash", "x"))
            .onSuccess(resp -> {
                ctx.verify(() -> assertEquals(400, resp.statusCode()));
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void collectShouldReturn400WhenBodyIsEmpty(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .post(port, "localhost", "/fingerprint/collect")
            .send()
            .onSuccess(resp -> {
                ctx.verify(() -> assertEquals(400, resp.statusCode()));
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void statsShouldReturn200(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .get(port, "localhost", "/fingerprint/stats")
            .send()
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject json = resp.bodyAsJsonObject();
                    assertEquals(200, json.getInteger("status"));
                    assertEquals(100, json.getJsonObject("data").getInteger("total"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void collectShouldReturn500WhenServiceFails(Vertx vertx, VertxTestContext ctx) {
        when(mockService.collect(any())).thenReturn(Future.failedFuture("DB down"));

        JsonObject body = new JsonObject().put("fullHash", "a".repeat(64));
        WebClient.create(vertx)
            .post(port, "localhost", "/fingerprint/collect")
            .sendJsonObject(body)
            .onSuccess(resp -> {
                ctx.verify(() -> assertEquals(500, resp.statusCode()));
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    // ── 输入清洗工具方法测试（通过子类访问 protected 方法） ──────────────
    static class TestableHandler extends BrowserFingerprintHandler {
        TestableHandler() { super(mock(FingerprintService.class)); }
    }

    @Test
    void sanitizeShouldReturnNullForNull() {
        TestableHandler h = new TestableHandler();
        assertNull(h.sanitize(null, 64));
    }

    @Test
    void sanitizeShouldReturnNullForBlank() {
        TestableHandler h = new TestableHandler();
        assertNull(h.sanitize("   ", 64));
    }

    @Test
    void sanitizeShouldTrimAndTruncate() {
        TestableHandler h = new TestableHandler();
        assertEquals("abc", h.sanitize("  abc  ", 64));
        assertEquals("ab", h.sanitize("abcde", 2));
    }

    @Test
    void clampIntShouldReturnNullForNull() {
        TestableHandler h = new TestableHandler();
        assertNull(h.clampInt(null, 1, 10));
    }

    @Test
    void clampIntShouldClampToRange() {
        TestableHandler h = new TestableHandler();
        assertEquals(1, h.clampInt(0, 1, 10));
        assertEquals(10, h.clampInt(99, 1, 10));
        assertEquals(5, h.clampInt(5, 1, 10));
    }

    @Test
    void clampDoubleShouldReturnNullForNull() {
        TestableHandler h = new TestableHandler();
        assertNull(h.clampDouble(null, 0.5, 10.0));
    }

    @Test
    void clampDoubleShouldClampToRange() {
        TestableHandler h = new TestableHandler();
        assertEquals(0.5, h.clampDouble(0.1, 0.5, 10.0));
        assertEquals(10.0, h.clampDouble(99.9, 0.5, 10.0));
        assertEquals(2.0, h.clampDouble(2.0, 0.5, 10.0));
    }
}
