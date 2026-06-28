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
                .jsonPath("$.data.recommendation").isEqualTo("websocket");
    }

    @Test
    void benchmark_returns_payload_with_server_time() {
        client.get().uri("/transport-lab/benchmark?size=512")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.serverTime").isNumber()
                .jsonPath("$.data.size").isEqualTo(512);
    }

    @Test
    void scenario_trading_returns_symbols_and_trades() {
        client.get().uri("/transport-lab/scenario/trading")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.scenario").isEqualTo("trading")
                .jsonPath("$.data.symbols.length()").isEqualTo(6)
                .jsonPath("$.data.recentTrades.length()").isEqualTo(8);
    }

    @Test
    void scenario_profile_returns_8_fields() {
        client.get().uri("/transport-lab/scenario/profile")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.scenario").isEqualTo("profile")
                .jsonPath("$.data.fields.length()").isEqualTo(8);
    }

    @Test
    void scenario_dashboard_returns_metrics() {
        client.get().uri("/transport-lab/scenario/dashboard")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.scenario").isEqualTo("dashboard")
                .jsonPath("$.data.metrics.length()").isEqualTo(6);
    }

    @Test
    void scenario_gaming_returns_players() {
        client.get().uri("/transport-lab/scenario/gaming")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.scenario").isEqualTo("gaming")
                .jsonPath("$.data.players.length()").isEqualTo(6);
    }

    @Test
    void scenario_idle_returns_idle_data() {
        client.get().uri("/transport-lab/scenario/idle")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.scenario").isEqualTo("idle")
                .jsonPath("$.data.message").isNotEmpty()
                .jsonPath("$.data.httpHeadersPerPoll").isEqualTo(900)
                .jsonPath("$.data.wsFrameHeaderBytes").isEqualTo(2)
                .jsonPath("$.data.tcpIpOverheadPerPacket").isEqualTo(40)
                .jsonPath("$.data.ethernetMinFrame").isEqualTo(64);
    }
}
