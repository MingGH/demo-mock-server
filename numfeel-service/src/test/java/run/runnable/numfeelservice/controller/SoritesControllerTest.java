package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SoritesStatsResponse;
import run.runnable.numfeelservice.service.SoritesService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * SoritesController HTTP 层测试：用 WebTestClient 的 standalone controller 绑定，
 * mock service，验证状态码与响应结构（迁移自旧版 SoritesHandlerTest，不依赖 DB/网络）。
 */
class SoritesControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SoritesService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SoritesService.class);
        client = WebTestClient.bindToController(new SoritesController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(eq(1500), eq("sharp"), eq(5000), eq(45)))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sandBoundary", 1500);
        body.put("sandSharpness", "sharp");
        body.put("baldBoundary", 5000);
        body.put("colorBoundary", 45);

        client.post().uri("/sorites/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.submitted").isEqualTo(true);
    }

    @Test
    void post_missing_sandBoundary_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sandSharpness", "sharp");
        body.put("baldBoundary", 5000);
        body.put("colorBoundary", 45);

        client.post().uri("/sorites/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_sandBoundary_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sandBoundary", 20000);
        body.put("sandSharpness", "sharp");
        body.put("baldBoundary", 5000);
        body.put("colorBoundary", 45);

        client.post().uri("/sorites/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyInt(), anyString(), anyInt(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sandBoundary", 1500);
        body.put("sandSharpness", "sharp");
        body.put("baldBoundary", 5000);
        body.put("colorBoundary", 45);

        client.post().uri("/sorites/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        SoritesStatsResponse mockData = new SoritesStatsResponse(
                100L, 2000L, 3000L, 40L, 1900, 2800, 45,
                java.util.List.of(), java.util.List.of(), java.util.List.of()
        );
        when(mockService.stats()).thenReturn(Mono.just(mockData));

        client.get().uri("/sorites/stats")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.totalCount").isEqualTo(100)
                .jsonPath("$.data.sandMean").isEqualTo(2000);
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/sorites/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
