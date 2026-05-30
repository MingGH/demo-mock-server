package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.CosmicReaperService;
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

class CosmicReaperControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CosmicReaperService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(CosmicReaperService.class);
        client = WebTestClient.bindToController(new CosmicReaperController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyBoolean(), anyInt(), anyInt(),
                anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("strategy", "aggressive");
        body.put("escaped", true);
        body.put("turns", 10);
        body.put("score", 85);
        body.put("finalTech", 90);
        body.put("finalSignal", 30);
        body.put("finalStealth", 20);

        client.post().uri("/cosmic-reaper/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/cosmic-reaper/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_strategy_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("strategy", "invalid");
        body.put("escaped", true);
        body.put("turns", 10);
        body.put("score", 85);

        client.post().uri("/cosmic-reaper/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_required_fields_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("strategy", "balanced");
        body.put("turns", 10);

        client.post().uri("/cosmic-reaper/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyBoolean(), anyInt(), anyInt(),
                anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("strategy", "stealth");
        body.put("escaped", false);
        body.put("turns", 8);
        body.put("score", 60);

        client.post().uri("/cosmic-reaper/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.getStats()).thenReturn(Mono.empty());

        client.get().uri("/cosmic-reaper/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.getStats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/cosmic-reaper/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
