package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.MonkeyStatsService;
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

class MonkeyStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MonkeyStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(MonkeyStatsService.class);
        client = WebTestClient.bindToController(new MonkeyStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyInt(), anyLong(), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("targetText", "hello");
        body.put("targetLength", 5);
        body.put("totalAttempts", 1000000);
        body.put("totalChars", 5000000);
        body.put("success", true);
        body.put("timeElapsed", 120);

        client.post().uri("/monkey/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/monkey/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_fields_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("targetText", "hello");
        body.put("targetLength", 5);

        client.post().uri("/monkey/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_targetLength_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("targetText", "hello");
        body.put("targetLength", 20);
        body.put("totalAttempts", 1000000);
        body.put("totalChars", 5000000);
        body.put("success", true);
        body.put("timeElapsed", 120);

        client.post().uri("/monkey/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyLong(), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("targetText", "hello");
        body.put("targetLength", 5);
        body.put("totalAttempts", 1000000);
        body.put("totalChars", 5000000);
        body.put("success", false);
        body.put("timeElapsed", 60);

        client.post().uri("/monkey/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/monkey/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/monkey/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
