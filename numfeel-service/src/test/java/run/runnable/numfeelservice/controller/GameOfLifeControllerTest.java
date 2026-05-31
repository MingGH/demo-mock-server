package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.GameOfLifeService;
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

class GameOfLifeControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GameOfLifeService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(GameOfLifeService.class);
        client = WebTestClient.bindToController(new GameOfLifeController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // ── POST /game-of-life/submit ──

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyString(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1],[1,2]]");
        body.put("gridCols", 80);
        body.put("gridRows", 50);
        body.put("description", "");

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_blank_patternKey_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_patternKey_too_long_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "a".repeat(33));
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_null_gridData_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_blank_gridData_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "");
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridData_too_long_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "a".repeat(65537));
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_null_gridCols_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridCols_below_min_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 9);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridCols_above_max_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 501);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_null_gridRows_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridRows_below_min_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 9);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridRows_above_max_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 501);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_description_too_long_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 50);
        body.put("description", "a".repeat(257));

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyString(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("patternKey", "glider");
        body.put("gridData", "[[0,1]]");
        body.put("gridCols", 80);
        body.put("gridRows", 50);

        client.post().uri("/game-of-life/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ── GET /game-of-life/stats ──

    @Test
    void get_stats_returns_data() {
        when(mockService.getStats()).thenReturn(Mono.empty());

        client.get().uri("/game-of-life/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.getStats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/game-of-life/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
