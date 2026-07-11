package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.BrainComputeService;
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

class BrainComputeControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private BrainComputeService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(BrainComputeService.class);
        client = WebTestClient.bindToController(new BrainComputeController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private ObjectNode validBody() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "玩家一");
        body.put("reactionMs", 250);
        body.put("catMs", 1200);
        body.put("ballScore", 80);
        body.put("cfTurnstileToken", "tok");
        return body;
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.empty());
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_empty_name_returns_400() {
        ObjectNode body = validBody();
        body.put("name", "   ");
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_reaction_returns_400() {
        ObjectNode body = validBody();
        body.put("reactionMs", 10); // 低于 100，抢跳级别，拒绝
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_cat_returns_400() {
        ObjectNode body = validBody();
        body.put("catMs", 50); // 低于 200
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_ballscore_returns_400() {
        ObjectNode body = validBody();
        body.put("ballScore", 150); // 超过 100
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_token_returns_400() {
        ObjectNode body = validBody();
        body.put("cfTurnstileToken", "");
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_turnstile_failure_returns_400() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.error(new IllegalArgumentException("Turnstile verification failed")));
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));
        client.post().uri("/brain-compute/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_top_returns_data() {
        when(mockService.top(20)).thenReturn(Mono.empty());
        client.get().uri("/brain-compute/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_top_service_failure_returns_500() {
        when(mockService.top(anyInt())).thenReturn(Mono.error(new RuntimeException("DB down")));
        client.get().uri("/brain-compute/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void delete_clear_returns_data() {
        when(mockService.clear()).thenReturn(Mono.empty());
        client.delete().uri("/brain-compute/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void delete_clear_service_failure_returns_500() {
        when(mockService.clear()).thenReturn(Mono.error(new RuntimeException("DB down")));
        client.delete().uri("/brain-compute/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
