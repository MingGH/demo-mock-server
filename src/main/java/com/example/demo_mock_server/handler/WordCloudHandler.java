package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.WordCloudService;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 词云 HTTP 处理器
 * GET /word-cloud
 */
public class WordCloudHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(WordCloudHandler.class);

    private final Vertx vertx;
    private final WordCloudService service;

    public WordCloudHandler(Vertx vertx, WordCloudService service) {
        this.vertx = vertx;
        this.service = service;
    }

    @Override
    public void handle(RoutingContext ctx) {
        String searchWord = ctx.queryParams().get("search");

        WordCloudService.WordCloudData cached;
        try {
            cached = service.getOrLoad();
        } catch (Exception e) {
            log.error("Failed to load word cloud data", e);
            ctx.response().setStatusCode(500)
                .end(new JsonObject().put("error", e.getMessage()).encode());
            return;
        }

        if (cached != null) {
            respond(ctx, cached, searchWord);
            return;
        }

        vertx.executeBlocking(promise -> {
            try {
                promise.complete(service.getOrLoad());
            } catch (Exception e) {
                promise.fail(e);
            }
        }, res -> {
            if (res.succeeded()) {
                respond(ctx, (WordCloudService.WordCloudData) res.result(), searchWord);
            } else {
                log.error("Word cloud load failed", res.cause());
                ctx.response().setStatusCode(500)
                    .end(new JsonObject().put("error", res.cause().getMessage()).encode());
            }
        });
    }

    private void respond(RoutingContext ctx, WordCloudService.WordCloudData data, String searchWord) {
        ctx.response().putHeader("Content-Type", "application/json; charset=utf-8");

        if (searchWord != null && !searchWord.isBlank()) {
            String word = searchWord.trim();
            int count = data.fullCounts().getOrDefault(word, 0);
            boolean inTop300 = false;
            for (int i = 0; i < data.top300().size(); i++) {
                if (data.top300().getJsonObject(i).getString("name").equals(word)) {
                    inTop300 = true;
                    break;
                }
            }
            ctx.response().end(new JsonObject()
                .put("word", word)
                .put("count", count)
                .put("inTop300", inTop300)
                .encode());
        } else {
            ctx.response().end(data.top300().encode());
        }
    }
}
