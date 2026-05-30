package run.runnable.numfeelservice.generator;

import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

/**
 * ChineseNameGenerator 单元测试，使用真实 Datafaker。
 */
class ChineseNameGeneratorTest {

    @Test
    void generate_single_name() {
        ChineseNameGenerator generator = new ChineseNameGenerator();

        StepVerifier.create(generator.generate(1))
                .expectNextMatches(name -> name != null && !name.isEmpty())
                .verifyComplete();
    }

    @Test
    void generate_small_count() {
        ChineseNameGenerator generator = new ChineseNameGenerator();

        StepVerifier.create(generator.generate(5))
                .expectNextCount(5)
                .verifyComplete();
    }

    @Test
    void generate_medium_count() {
        ChineseNameGenerator generator = new ChineseNameGenerator();

        StepVerifier.create(generator.generate(10))
                .expectNextCount(10)
                .verifyComplete();
    }

    @Test
    void generate_all_names_are_non_empty() {
        ChineseNameGenerator generator = new ChineseNameGenerator();

        StepVerifier.create(generator.generate(5))
                .recordWith(java.util.ArrayList::new)
                .expectNextCount(5)
                .consumeRecordedWith(names -> {
                    for (String name : names) {
                        assert name != null && !name.isBlank();
                    }
                })
                .verifyComplete();
    }
}
