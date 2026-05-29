package ninja._6.numfeelservice.generator;

import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;
import net.datafaker.Faker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 假数据生成器（迁移自 Vert.x 版，JsonObject 换成 Jackson ObjectNode）。
 */
@Component
public class FakeDataGenerator {

    private static final Faker FAKER = new Faker();
    private static final JsonNodeFactory NF = JsonNodeFactory.instance;

    private final int parallelism;

    public FakeDataGenerator() {
        this.parallelism = Math.min(8, Runtime.getRuntime().availableProcessors());
    }

    public FakeDataGenerator(int parallelism) {
        this.parallelism = parallelism;
    }

    /** 并行生成假数据。 */
    public Flux<ObjectNode> generate(int total) {
        return Flux.range(0, total)
                .parallel(parallelism)
                .runOn(Schedulers.boundedElastic())
                .flatMap(id -> Mono.fromCallable(() -> createPerson(id)))
                .sequential();
    }

    private ObjectNode createPerson(int id) {
        ObjectNode o = NF.objectNode();
        o.put("id", id);
        o.put("name", FAKER.name().fullName());
        o.put("email", FAKER.internet().emailAddress());
        o.put("phone", FAKER.phoneNumber().cellPhone());
        o.put("address", FAKER.address().fullAddress());
        o.put("company", FAKER.company().name());
        o.put("dob", FAKER.timeAndDate().birthday(18, 65).toString());
        o.put("job", FAKER.job().title());
        return o;
    }
}
