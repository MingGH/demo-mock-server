package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.TrackingRequests.BrowserFingerprintCollectRequest;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintCollectResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintStatsResponse;
import run.runnable.numfeelservice.service.FingerprintService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * BrowserFingerprintController HTTP 层测试。
 */
class BrowserFingerprintControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private FingerprintService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(FingerprintService.class);
        client = WebTestClient.bindToController(new BrowserFingerprintController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void collect_valid_body_returns_200() {
        when(mockService.collect(any()))
                .thenReturn(Mono.just(new BrowserFingerprintCollectResponse(100, 5L, 1700000000000L, "mysql")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("fullHash", "abc123def456");
        body.put("canvasHash", "canvas001");
        body.put("fontHash", "font001");
        body.put("webglHash", "webgl001");
        body.put("screenInfo", "1920x1080@24bit");
        body.put("timezone", "Asia/Shanghai");
        body.put("language", "zh-CN");
        body.put("platform", "Win32");
        body.put("hardwareConcurrency", 8);
        body.put("deviceMemory", 8);
        body.put("touchSupport", false);
        body.put("colorDepth", 24);
        body.put("pixelRatio", 2.0);
        body.put("entropyBits", 32.5);

        client.post().uri("/fingerprint/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.total").isEqualTo(100)
                .jsonPath("$.data.source").isEqualTo("mysql");
    }

    @Test
    void collect_null_body_returns_400() {
        client.post().uri("/fingerprint/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void collect_missing_fullHash_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("canvasHash", "canvas001");

        client.post().uri("/fingerprint/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void collect_service_error_returns_500() {
        when(mockService.collect(any()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("fullHash", "abc123");

        client.post().uri("/fingerprint/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void stats_returns_data() {
        BrowserFingerprintStatsResponse stats = new BrowserFingerprintStatsResponse(
                1000L, 800L, 1.25, 600L, 500L, 400L, 50L, 80L, 5L, 28.5);
        when(mockService.stats()).thenReturn(Mono.just(stats));

        client.get().uri("/fingerprint/stats")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.total").isEqualTo(1000)
                .jsonPath("$.data.uniqueFull").isEqualTo(800);
    }

    @Test
    void stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/fingerprint/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
