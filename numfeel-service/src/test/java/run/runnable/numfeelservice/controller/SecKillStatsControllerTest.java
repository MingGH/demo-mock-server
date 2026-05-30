package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.SecKillStatsService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SecKillStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SecKillStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SecKillStatsService.class);
        client = WebTestClient.bindToController(new SecKillStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyInt(), anyInt(), anyBoolean(), anyInt(), anyDouble(), anyDouble()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("participants", 1000);
        body.put("stock", 100);
        body.put("userWon", true);
        body.put("userRank", 50);
        body.put("userLatency", 120.5);
        body.put("latencyGap", 15.3);

        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_fields_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("participants", 1000);
        body.put("stock", 100);

        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_participants_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("participants", 0);
        body.put("stock", 100);
        body.put("userWon", true);
        body.put("userRank", 50);
        body.put("userLatency", 120.5);
        body.put("latencyGap", 15.3);

        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_stock_exceeds_participants_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("participants", 100);
        body.put("stock", 200);
        body.put("userWon", true);
        body.put("userRank", 50);
        body.put("userLatency", 120.5);
        body.put("latencyGap", 15.3);

        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyInt(), anyInt(), anyBoolean(), anyInt(), anyDouble(), anyDouble()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("participants", 1000);
        body.put("stock", 100);
        body.put("userWon", false);
        body.put("userRank", 200);
        body.put("userLatency", 250.0);
        body.put("latencyGap", 30.0);

        client.post().uri("/seckill/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/seckill/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/seckill/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
