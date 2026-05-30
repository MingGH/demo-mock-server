package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.CascadeFailureService;
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

class CascadeFailureControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CascadeFailureService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(CascadeFailureService.class);
        client = WebTestClient.bindToController(new CascadeFailureController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyString(), anyString(),
                anyDouble(), anyInt(), anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("topology", "random");
        body.put("coupling", 50);
        body.put("capacity", 50);
        body.put("strategy", "none");
        body.put("triggerPos", "center");
        body.put("survivalRate", 0.75);
        body.put("cascadeSteps", 5);
        body.put("maxComponent", 80);
        body.put("totalNodes", 100);
        body.put("score", 80);

        client.post().uri("/cascade-failure/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/cascade-failure/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_topology_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("topology", "invalid");
        body.put("coupling", 50);
        body.put("capacity", 50);
        body.put("strategy", "none");
        body.put("survivalRate", 0.75);
        body.put("cascadeSteps", 5);
        body.put("score", 80);

        client.post().uri("/cascade-failure/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyString(), anyString(),
                anyDouble(), anyInt(), anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("topology", "grid");
        body.put("coupling", 50);
        body.put("capacity", 50);
        body.put("strategy", "hub");
        body.put("survivalRate", 0.75);
        body.put("cascadeSteps", 5);
        body.put("score", 80);

        client.post().uri("/cascade-failure/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/cascade-failure/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/cascade-failure/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_leaderboard_without_limit_returns_data() {
        when(mockService.leaderboard(20)).thenReturn(Mono.empty());

        client.get().uri("/cascade-failure/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_leaderboard_with_limit_returns_data() {
        when(mockService.leaderboard(10)).thenReturn(Mono.empty());

        client.get().uri("/cascade-failure/leaderboard?limit=10")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_leaderboard_service_failure_returns_500() {
        when(mockService.leaderboard(anyInt())).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/cascade-failure/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
