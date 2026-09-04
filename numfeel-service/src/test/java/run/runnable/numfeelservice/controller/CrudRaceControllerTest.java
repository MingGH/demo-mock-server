package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CrudRaceService;
import run.runnable.numfeelservice.service.CrudRaceService.RunResult;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * CrudRaceController HTTP 层测试：WebTestClient standalone 绑定，mock service，
 * 验证参数校验与响应结构。
 */
class CrudRaceControllerTest {

    private CrudRaceService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(CrudRaceService.class);
        // Controller 对 mysql 引擎先同步拿许可，默认放行，个别用例单独覆盖
        when(mockService.tryAcquireMysqlPermit()).thenReturn(true);
        client = WebTestClient.bindToController(new CrudRaceController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // ============= POST /crud-race/run =============

    @Test
    void run_valid_request() {
        RunResult mockResult = new RunResult("text", "get", 100, 200, 200,
                15L, 320L, 1600.0, 625.0, 4400L);
        when(mockService.run("text", 100, "get", 200))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"engine\":\"text\",\"op\":\"get\",\"count\":100,\"ops\":200}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.engine").isEqualTo("text")
                .jsonPath("$.data.op").isEqualTo("get")
                .jsonPath("$.data.count").isEqualTo(100)
                .jsonPath("$.data.okCount").isEqualTo(200)
                .jsonPath("$.data.resetMs").isEqualTo(15)
                .jsonPath("$.data.totalMs").isEqualTo(320)
                .jsonPath("$.data.qps").isEqualTo(625.0)
                .jsonPath("$.data.dataSizeBytes").isEqualTo(4400);
    }

    @Test
    void run_defaults_when_body_missing() {
        RunResult mockResult = new RunResult("text", "get", 100, 200, 200,
                0L, 10L, 50.0, 20000.0, 4400L);
        when(mockService.run("text", 100, "get", 200))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/crud-race/run")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.engine").isEqualTo("text")
                .jsonPath("$.data.op").isEqualTo("get");
    }

    @Test
    void run_invalid_engine_returns_400() {
        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"engine\":\"redis\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void run_invalid_op_returns_400() {
        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"op\":\"scan\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void run_count_out_of_range_returns_400() {
        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"count\":1000000}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void run_ops_out_of_range_returns_400() {
        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"ops\":0}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void run_mysql_permit_busy_returns_503() {
        when(mockService.tryAcquireMysqlPermit()).thenReturn(false);

        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"engine\":\"mysql\",\"op\":\"get\"}")
                .exchange()
                .expectStatus().isEqualTo(503);
    }

    @Test
    void run_service_error_returns_500() {
        when(mockService.run("mysql", 100, "get", 200))
                .thenReturn(Mono.error(new RuntimeException("Connection refused")));

        client.post().uri("/crud-race/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"engine\":\"mysql\"}")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ============= GET /crud-race/status =============

    @Test
    void status_returns_engines() {
        when(mockService.status())
                .thenReturn(Mono.just(java.util.Map.of(
                        "text", java.util.Map.of("available", true),
                        "mysql", java.util.Map.of("available", true),
                        "caffeine", java.util.Map.of("available", true))));

        client.get().uri("/crud-race/status")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.mysql.available").isEqualTo(true)
                .jsonPath("$.data.caffeine.available").isEqualTo(true);
    }

    @Test
    void status_service_error_returns_500() {
        when(mockService.status())
                .thenReturn(Mono.error(new RuntimeException("boom")));

        client.get().uri("/crud-race/status")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
