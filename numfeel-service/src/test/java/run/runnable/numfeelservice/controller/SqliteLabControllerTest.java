package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.SqliteLabService;
import run.runnable.numfeelservice.service.SqliteLabService.BurstResult;
import run.runnable.numfeelservice.service.SqliteLabService.StatsResult;
import run.runnable.numfeelservice.service.SqliteLabService.WriteResult;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * SqliteLabController HTTP 层测试：用 WebTestClient standalone 绑定，
 * mock service，验证状态码与响应结构。
 */
class SqliteLabControllerTest {

    private SqliteLabService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SqliteLabService.class);
        client = WebTestClient.bindToController(new SqliteLabController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // ============= POST /sqlite-lab/write =============

    @Test
    void write_returns_success() {
        when(mockService.singleWrite(anyString()))
                .thenReturn(Mono.just(new WriteResult(true, 5L, null)));

        client.post().uri("/sqlite-lab/write")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.success").isEqualTo(true)
                .jsonPath("$.data.latencyMs").isEqualTo(5);
    }

    @Test
    void write_service_error_returns_500() {
        when(mockService.singleWrite(anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB exploded")));

        client.post().uri("/sqlite-lab/write")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ============= POST /sqlite-lab/burst =============

    @Test
    void burst_valid_request() {
        BurstResult mockResult = new BurstResult(10, 8, 2, 150L, 10L, 45L, 80L, 120L, false);
        when(mockService.burst(10, false))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"concurrency\":10,\"walMode\":false}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.concurrency").isEqualTo(10)
                .jsonPath("$.data.successCount").isEqualTo(8)
                .jsonPath("$.data.busyCount").isEqualTo(2)
                .jsonPath("$.data.p50Ms").isEqualTo(10)
                .jsonPath("$.data.p95Ms").isEqualTo(45)
                .jsonPath("$.data.walMode").isEqualTo(false);
    }

    @Test
    void burst_with_wal_mode() {
        BurstResult mockResult = new BurstResult(20, 20, 0, 200L, 8L, 30L, 50L, 60L, true);
        when(mockService.burst(20, true))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"concurrency\":20,\"walMode\":true}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.walMode").isEqualTo(true)
                .jsonPath("$.data.successCount").isEqualTo(20);
    }

    @Test
    void burst_concurrency_too_high_returns_400() {
        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"concurrency\":500}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void burst_concurrency_zero_returns_400() {
        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"concurrency\":0}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void burst_default_concurrency_when_missing_body() {
        BurstResult mockResult = new BurstResult(10, 10, 0, 100L, 5L, 20L, 30L, 40L, false);
        when(mockService.burst(10, false))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.concurrency").isEqualTo(10);
    }

    @Test
    void burst_service_error_returns_500() {
        when(mockService.burst(anyInt(), anyBoolean()))
                .thenReturn(Mono.error(new RuntimeException("Thread pool exhausted")));

        client.post().uri("/sqlite-lab/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"concurrency\":10}")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ============= GET /sqlite-lab/stats =============

    @Test
    void stats_returns_data() {
        StatsResult mockStats = new StatsResult(1000L, 40960L, 12.5, 1500L, 50L);
        when(mockService.stats())
                .thenReturn(Mono.just(mockStats));

        client.get().uri("/sqlite-lab/stats")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.rowCount").isEqualTo(1000)
                .jsonPath("$.data.fileSizeBytes").isEqualTo(40960)
                .jsonPath("$.data.currentQps").isEqualTo(12.5)
                .jsonPath("$.data.totalWrites").isEqualTo(1500)
                .jsonPath("$.data.totalBusyErrors").isEqualTo(50);
    }

    @Test
    void stats_service_error_returns_500() {
        when(mockService.stats())
                .thenReturn(Mono.error(new RuntimeException("IO error")));

        client.get().uri("/sqlite-lab/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ============= POST /sqlite-lab/reset =============

    @Test
    void reset_success() {
        when(mockService.reset())
                .thenReturn(Mono.empty());

        client.post().uri("/sqlite-lab/reset")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.reset").isEqualTo(true);
    }

    @Test
    void reset_service_error_returns_500() {
        when(mockService.reset())
                .thenReturn(Mono.error(new RuntimeException("Permission denied")));

        client.post().uri("/sqlite-lab/reset")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
