package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.EmailTrackingPixelService;
import com.example.demo_mock_server.service.GeoLocationService;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
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
class EmailTrackingPixelHandlerTest {

    private int port;

    @BeforeEach
    void setup(Vertx vertx, VertxTestContext ctx) {
        EmailTrackingPixelService service = new EmailTrackingPixelService(new GeoLocationService());
        EmailTrackingPixelHandler handler = new EmailTrackingPixelHandler(service);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.get("/email-tracking/pixel.gif").handler(handler);
        router.get("/email-tracking/stats").handler(handler);
        router.post("/email-tracking/reset").handler(handler);

        vertx.createHttpServer().requestHandler(router).listen(0)
            .onSuccess(server -> {
                port = server.actualPort();
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void pixelShouldReturnGifAndRecordEvent(Vertx vertx, VertxTestContext ctx) {
        WebClient client = WebClient.create(vertx);
        client.get(port, "localhost", "/email-tracking/pixel.gif?uid=user-1&campaign=demo&recipient=a%40example.com&mailbox=gmail&mode=direct")
            .send()
            .compose(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals("image/gif", resp.getHeader("Content-Type"));
                    assertTrue(resp.body().length() > 0);
                });
                return client.get(port, "localhost", "/email-tracking/stats").send();
            })
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    var body = resp.bodyAsJsonObject();
                    assertEquals(200, body.getInteger("status"));
                    assertEquals(1, body.getJsonObject("data").getJsonObject("summary").getInteger("openEvents"));
                    assertEquals(1, body.getJsonObject("data").getJsonObject("summary").getInteger("uniqueRecipients"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void pixelShouldReturn400WhenUidMissing(Vertx vertx, VertxTestContext ctx) {
        WebClient.create(vertx)
            .get(port, "localhost", "/email-tracking/pixel.gif")
            .send()
            .onSuccess(resp -> {
                ctx.verify(() -> assertEquals(400, resp.statusCode()));
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }

    @Test
    void resetShouldClearStats(Vertx vertx, VertxTestContext ctx) {
        WebClient client = WebClient.create(vertx);
        client.get(port, "localhost", "/email-tracking/pixel.gif?uid=user-2&campaign=demo&recipient=b%40example.com&mailbox=apple&mode=apple-mpp")
            .send()
            .compose(resp -> client.post(port, "localhost", "/email-tracking/reset").send())
            .compose(resp -> client.get(port, "localhost", "/email-tracking/stats").send())
            .onSuccess(resp -> {
                ctx.verify(() -> {
                    var summary = resp.bodyAsJsonObject().getJsonObject("data").getJsonObject("summary");
                    assertEquals(0, summary.getInteger("openEvents"));
                    assertEquals(0, summary.getInteger("uniqueRecipients"));
                });
                ctx.completeNow();
            })
            .onFailure(ctx::failNow);
    }
}
