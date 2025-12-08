package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.generator.FakeDataGenerator;
import io.vertx.core.json.JsonObject;
import reactor.core.publisher.Flux;

/**
 * Mock 数据请求处理器
 */
public class MockHandler extends AbstractStreamHandler<JsonObject> {

    private static final int MIN_COUNT = 200;
    private static final int MAX_COUNT = 1_000_000;

    private final FakeDataGenerator dataGenerator;

    public MockHandler(FakeDataGenerator dataGenerator) {
        super(MIN_COUNT, MAX_COUNT);
        this.dataGenerator = dataGenerator;
    }

    @Override
    protected Flux<JsonObject> generateData(int total) {
        return dataGenerator.generate(total);
    }

    @Override
    protected String formatItem(JsonObject item) {
        return item.encode();
    }

    @Override
    protected String getLogPrefix() {
        return "Generated ";
    }
}
