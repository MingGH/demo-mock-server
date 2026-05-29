package ninja._6.numfeelservice.generator;

import net.datafaker.Faker;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Locale;

/**
 * 中文名生成器（迁移自 Vert.x 版，逻辑不变）。
 */
@Component
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
