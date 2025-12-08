package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.ext.web.RoutingContext;
import reactor.core.publisher.Flux;

/**
 * 流式响应处理器基类
 */
public abstract class AbstractStreamHandler<T> implements Handler<RoutingContext> {

    private final int minCount;
    private final int maxCount;

    protected AbstractStreamHandler(int minCount, int maxCount) {
        this.minCount = minCount;
        this.maxCount = maxCount;
    }

    @Override
    public void handle(RoutingContext ctx) {
        HttpServerRequest req = ctx.request();
        String nParam = req.getParam("n");

        if (!isValidParam(nParam)) {
            req.response()
                .setStatusCode(400)
                .end("Invalid parameter 'n' (" + minCount + " <= n <= " + maxCount + ")");
            return;
        }

        int n = Integer.parseInt(nParam);
        streamJsonResponse(ctx.vertx(), req.response(), n);
    }

    private boolean isValidParam(String nParam) {
        if (nParam == null || !nParam.matches("\\d+")) {
            return false;
        }
        int value = Integer.parseInt(nParam);
        return value >= minCount && value <= maxCount;
    }

    private void streamJsonResponse(Vertx vertx, HttpServerResponse response, int n) {
        long start = System.currentTimeMillis();

        response.putHeader("Content-Type", "application/json");

        generateData(n)
            .map(this::formatItem)
            .collectList()
            .subscribe(
                items -> {
                    long duration = System.currentTimeMillis() - start;
                    System.out.println(getLogPrefix() + items.size() + " records in " + duration + " ms");
                    
                    String json = "[" + String.join(",", items) + "]";
                    vertx.runOnContext(v -> response.end(json));
                },
                err -> vertx.runOnContext(v -> 
                    response.setStatusCode(500).end("Error: " + err.getMessage())
                )
            );
    }

    /**
     * 生成数据流
     */
    protected abstract Flux<T> generateData(int total);

    /**
     * 格式化单个数据项为 JSON 字符串
     */
    protected abstract String formatItem(T item);

    /**
     * 日志前缀
     */
    protected abstract String getLogPrefix();
}
