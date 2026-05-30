package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.InferenceLeaderboardService;
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

class InferenceLeaderboardControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private InferenceLeaderboardService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(InferenceLeaderboardService.class);
        client = WebTestClient.bindToController(new InferenceLeaderboardController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player1");
        body.put("score", 300);
        body.put("rounds", 3);
        body.put("wins", 2);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_empty_name_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("score", 300);
        body.put("rounds", 3);
        body.put("wins", 2);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_score_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player1");
        body.put("score", 700);
        body.put("rounds", 3);
        body.put("wins", 2);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_rounds_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player1");
        body.put("score", 300);
        body.put("rounds", 10);
        body.put("wins", 2);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_wins_greater_than_rounds_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player1");
        body.put("score", 300);
        body.put("rounds", 3);
        body.put("wins", 5);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player1");
        body.put("score", 300);
        body.put("rounds", 3);
        body.put("wins", 2);
        body.put("grade", "S");

        client.post().uri("/inference/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_top_returns_data() {
        when(mockService.top(20)).thenReturn(Mono.empty());

        client.get().uri("/inference/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_top_service_failure_returns_500() {
        when(mockService.top(anyInt())).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/inference/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void delete_clear_returns_data() {
        when(mockService.clear()).thenReturn(Mono.empty());

        client.delete().uri("/inference/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void delete_clear_service_failure_returns_500() {
        when(mockService.clear()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.delete().uri("/inference/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
