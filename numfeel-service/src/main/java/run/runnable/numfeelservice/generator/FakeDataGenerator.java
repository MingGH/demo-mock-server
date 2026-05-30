package run.runnable.numfeelservice.generator;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.MockPersonResponse;
import net.datafaker.Faker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 假数据生成器
 */
@Component
public class FakeDataGenerator {

    private static final Faker FAKER = new Faker();

    private final int parallelism;

    public FakeDataGenerator() {
        this.parallelism = Math.min(8, Runtime.getRuntime().availableProcessors());
    }

    public FakeDataGenerator(int parallelism) {
        this.parallelism = parallelism;
    }

    /** 并行生成假数据。 */
    public Flux<MockPersonResponse> generate(int total) {
        return Flux.range(0, total)
                .parallel(parallelism)
                .runOn(Schedulers.boundedElastic())
                .flatMap(id -> Mono.fromCallable(() -> createPerson(id)))
                .sequential();
    }

    private MockPersonResponse createPerson(int id) {
        return new MockPersonResponse(
                id,
                FAKER.name().fullName(),
                FAKER.internet().emailAddress(),
                FAKER.phoneNumber().cellPhone(),
                FAKER.address().fullAddress(),
                FAKER.company().name(),
                FAKER.timeAndDate().birthday(18, 65).toString(),
                FAKER.job().title()
        );
    }
}
