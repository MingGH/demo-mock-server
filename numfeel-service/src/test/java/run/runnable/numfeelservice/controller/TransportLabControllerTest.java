package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import run.runnable.numfeelservice.service.TransportLabService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

/**
 * TransportLabController HTTP 层测试。
 */
class TransportLabControllerTest {

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToController(new TransportLabController(new TransportLabService()))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void snapshot_high_frequency_recommends_websocket() {
        client.get().uri("/transport-lab/snapshot?eventsPerMinute=240&payloadSize=320&activeSeconds=180&clients=800&pollInterval=2&reconnects=1")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.recommendation").isEqualTo("websocket")
                .jsonPath("$.data.eventCount").isEqualTo(720);
    }

    @Test
    void snapshot_sparse_interaction_recommends_http() {
        client.get().uri("/transport-lab/snapshot?eventsPerMinute=1&payloadSize=1600&activeSeconds=120&clients=1200&pollInterval=30&reconnects=0")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.recommendation").isEqualTo("http")
                .jsonPath("$.data.pollCount").isEqualTo(4);
    }

    @Test
    void benchmark_returns_payload_with_server_time() {
        client.get().uri("/transport-lab/benchmark?size=512")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.serverTime").isNumber()
                .jsonPath("$.data.size").isEqualTo(512)
                .jsonPath("$.data.payload").isNotEmpty();
    }

    @Test
    void benchmark_default_size() {
        client.get().uri("/transport-lab/benchmark")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.size").isEqualTo(1024);
    }

    @Test
    void benchmark_clamps_large_size() {
        client.get().uri("/transport-lab/benchmark?size=999999")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.size").isEqualTo(65536);
    }
}
