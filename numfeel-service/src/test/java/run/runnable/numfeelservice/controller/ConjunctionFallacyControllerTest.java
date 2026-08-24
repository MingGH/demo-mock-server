package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyStatsResponse;
import run.runnable.numfeelservice.service.ConjunctionFallacyService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConjunctionFallacyControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ConjunctionFallacyService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(ConjunctionFallacyService.class);
        client = WebTestClient.bindToController(new ConjunctionFallacyController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        ConjunctionFallacyStatsResponse stats = new ConjunctionFallacyStatsResponse(
                1, 2.0, 0, 80.0, List.of(new ConjunctionFallacyQuestionRate(1, 1, 0, 1, 100.0, 0.0)));
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.just(stats));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "s1");
        body.put("totalQuestions", 10);
        body.put("correctCount", 2);
        body.put("answers", "[1,0,1,0,1,0,1,0,1,0]");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.totalSessions").isEqualTo(1);
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_session_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("totalQuestions", 10);
        body.put("correctCount", 5);
        body.put("answers", "[1,0,1,0,1,0,1,0,1,0]");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_total_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "s1");
        body.put("totalQuestions", 9);
        body.put("correctCount", 5);
        body.put("answers", "[1,0,1,0,1,0,1,0,1]");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_correct_exceeds_total_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "s1");
        body.put("totalQuestions", 10);
        body.put("correctCount", 11);
        body.put("answers", "[1,0,1,0,1,0,1,0,1,0]");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_answers_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "s1");
        body.put("totalQuestions", 10);
        body.put("correctCount", 5);
        body.put("answers", "not-json");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "s1");
        body.put("totalQuestions", 10);
        body.put("correctCount", 5);
        body.put("answers", "[1,0,1,0,1,0,1,0,1,0]");

        client.post().uri("/conjunction-fallacy/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        ConjunctionFallacyStatsResponse stats = new ConjunctionFallacyStatsResponse(
                10, 3.5, 10.0, 65.0, List.of(new ConjunctionFallacyQuestionRate(1, 10, 4, 6, 60.0, 40.0)));
        when(mockService.stats()).thenReturn(Mono.just(stats));

        client.get().uri("/conjunction-fallacy/stats")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.totalSessions").isEqualTo(10)
                .jsonPath("$.data.avgCorrect").isEqualTo(3.5);
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/conjunction-fallacy/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
