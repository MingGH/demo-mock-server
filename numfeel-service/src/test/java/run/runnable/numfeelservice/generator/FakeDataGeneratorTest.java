package run.runnable.numfeelservice.generator;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.MockPersonResponse;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

/**
 * FakeDataGenerator 单元测试，使用真实 Datafaker。
 */
class FakeDataGeneratorTest {

    @Test
    void generate_single_record() {
        FakeDataGenerator generator = new FakeDataGenerator(2);

        StepVerifier.create(generator.generate(1))
                .expectNextCount(1)
                .verifyComplete();
    }

    @Test
    void generate_small_count() {
        FakeDataGenerator generator = new FakeDataGenerator(2);

        StepVerifier.create(generator.generate(5))
                .expectNextCount(5)
                .verifyComplete();
    }

    @Test
    void generate_records_have_required_fields() {
        FakeDataGenerator generator = new FakeDataGenerator(2);

        StepVerifier.create(generator.generate(3))
                .recordWith(java.util.ArrayList::new)
                .expectNextCount(3)
                .consumeRecordedWith(records -> {
                    for (MockPersonResponse r : records) {
                        assert r.name() != null && !r.name().isBlank();
                        assert r.email() != null && !r.email().isBlank();
                        assert r.phone() != null && !r.phone().isBlank();
                        assert r.address() != null && !r.address().isBlank();
                        assert r.company() != null && !r.company().isBlank();
                        assert r.dob() != null && !r.dob().isBlank();
                        assert r.job() != null && !r.job().isBlank();
                    }
                })
                .verifyComplete();
    }

    @Test
    void generate_ids_are_unique() {
        FakeDataGenerator generator = new FakeDataGenerator(2);

        StepVerifier.create(generator.generate(3))
                .recordWith(java.util.ArrayList::new)
                .expectNextCount(3)
                .consumeRecordedWith(records -> {
                    var ids = records.stream().map(MockPersonResponse::id).distinct().count();
                    assert ids == 3;
                })
                .verifyComplete();
    }
}
