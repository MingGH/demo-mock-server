package com.example.demo_mock_server.generator;

import com.github.javafaker.Faker;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Locale;

/**
 * 中文名生成器
 */
public class ChineseNameGenerator {

    private static final Faker FAKER = new Faker(Locale.CHINA);
    private final int parallelism;

    public ChineseNameGenerator() {
        this.parallelism = Math.min(8, Runtime.getRuntime().availableProcessors());
    }

    public Flux<String> generate(int total) {
        return Flux.range(0, total)
            .parallel(parallelism)
            .runOn(Schedulers.boundedElastic())
            .flatMap(i -> Mono.fromCallable(() -> FAKER.name().fullName()))
            .sequential();
    }
}
