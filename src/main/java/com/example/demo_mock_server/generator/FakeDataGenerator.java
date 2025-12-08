package com.example.demo_mock_server.generator;

import com.github.javafaker.Faker;
import io.vertx.core.json.JsonObject;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 假数据生成器
 */
public class FakeDataGenerator {

    private static final Faker FAKER = new Faker();
    private final int parallelism;

    public FakeDataGenerator() {
        this.parallelism = Math.min(8, Runtime.getRuntime().availableProcessors());
    }

    public FakeDataGenerator(int parallelism) {
        this.parallelism = parallelism;
    }

    /**
     * 并行生成假数据
     */
    public Flux<JsonObject> generate(int total) {
        return Flux.range(0, total)
            .parallel(parallelism)
            .runOn(Schedulers.boundedElastic())
            .flatMap(id -> Mono.fromCallable(() -> createPerson(id)))
            .sequential();
    }

    private JsonObject createPerson(int id) {
        return new JsonObject()
            .put("id", id)
            .put("name", FAKER.name().fullName())
            .put("email", FAKER.internet().emailAddress())
            .put("phone", FAKER.phoneNumber().cellPhone())
            .put("address", FAKER.address().fullAddress())
            .put("company", FAKER.company().name())
            .put("dob", FAKER.date().birthday(18, 65).toString())
            .put("job", FAKER.job().title());
    }
}
