package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.generator.ChineseNameGenerator;
import run.runnable.numfeelservice.generator.FakeDataGenerator;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * GeneratorController HTTP 层测试，使用真实的 generator（Datafaker + boundedElastic）。
 */
class GeneratorControllerTest {

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToController(
                new GeneratorController(new FakeDataGenerator(2), new ChineseNameGenerator()))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void mock_valid_n_returns_json_array() {
        client.get().uri("/mock?n=200")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> {
                    assert body != null;
                    assert body.startsWith("[");
                    assert body.endsWith("]");
                });
    }

    @Test
    void mock_invalid_n_below_min_returns_400() {
        client.get().uri("/mock?n=10")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void mock_invalid_n_above_max_returns_400() {
        client.get().uri("/mock?n=2000000")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void mock_missing_n_returns_400() {
        client.get().uri("/mock")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void mock_large_n_returns_200() {
        client.get().uri("/mock?n=1000")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> {
                    assert body != null;
                    assert body.contains("\"name\"");
                    assert body.contains("\"email\"");
                });
    }

    @Test
    void chineseNames_valid_n_returns_array() {
        client.get().uri("/chinese-names?n=5")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> {
                    assert body != null;
                    assert body.startsWith("[");
                    assert body.endsWith("]");
                });
    }

    @Test
    void chineseNames_invalid_n_returns_400() {
        client.get().uri("/chinese-names?n=200000")
                .exchange()
                .expectStatus().isEqualTo(400);
    }
}
