package run.runnable.numfeelservice.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 Grafana 可观测性接入依赖的管理端口和端点。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "management.server.port=0",
                "management.otlp.metrics.export.enabled=false",
                "spring.main.banner-mode=off"
        })
class ObservabilityActuatorTest {

    @LocalManagementPort
    private int managementPort;

    private WebTestClient webTestClient;

    @BeforeEach
    void setUp() {
        webTestClient = WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + managementPort)
                .build();
    }

    @Test
    void livenessProbeIsAvailableOnManagementPort() {
        webTestClient.get()
                .uri("/actuator/health/liveness")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo("UP");
    }

    @Test
    void prometheusEndpointExposesJvmMetrics() {
        String body = webTestClient.get()
                .uri("/actuator/prometheus")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .returnResult()
                .getResponseBody();

        assertThat(body)
                .contains("# HELP jvm_")
                .contains("application=\"numfeel-service\"");
    }
}
