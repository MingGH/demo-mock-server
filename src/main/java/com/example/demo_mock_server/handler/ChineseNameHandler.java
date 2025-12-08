package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.generator.ChineseNameGenerator;
import reactor.core.publisher.Flux;

/**
 * 中文名请求处理器
 */
public class ChineseNameHandler extends AbstractStreamHandler<String> {

    private static final int MIN_COUNT = 1;
    private static final int MAX_COUNT = 100_000;

    private final ChineseNameGenerator nameGenerator;

    public ChineseNameHandler(ChineseNameGenerator nameGenerator) {
        super(MIN_COUNT, MAX_COUNT);
        this.nameGenerator = nameGenerator;
    }

    @Override
    protected Flux<String> generateData(int total) {
        return nameGenerator.generate(total);
    }

    @Override
    protected String formatItem(String item) {
        return "\"" + item + "\"";
    }

    @Override
    protected String getLogPrefix() {
        return "Generated Chinese names: ";
    }
}
