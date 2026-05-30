package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.NimGameStatsService;
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

class NimGameStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private NimGameStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(NimGameStatsService.class);
        client = WebTestClient.bindToController(new NimGameStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyString(), anyInt(), anyString()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("result", "win");
        body.put("difficulty", "normal");
        body.put("rounds", 10);
        body.put("preset", "classic");

        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_result_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("result", "draw");
        body.put("difficulty", "normal");
        body.put("rounds", 10);

        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_difficulty_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("result", "win");
        body.put("difficulty", "impossible");
        body.put("rounds", 10);

        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_rounds_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("result", "win");
        body.put("difficulty", "hard");
        body.put("rounds", 0);

        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyString(), anyInt(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("result", "lose");
        body.put("difficulty", "easy");
        body.put("rounds", 5);

        client.post().uri("/nim-game/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.getStats()).thenReturn(Mono.empty());

        client.get().uri("/nim-game/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.getStats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/nim-game/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
