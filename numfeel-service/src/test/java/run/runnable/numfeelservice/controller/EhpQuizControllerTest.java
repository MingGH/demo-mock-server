package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.EhpQuizStatsResponse;
import run.runnable.numfeelservice.service.EhpQuizService;
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

class EhpQuizControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EhpQuizService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(EhpQuizService.class);
        client = WebTestClient.bindToController(new EhpQuizController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        EhpQuizStatsResponse stats = new EhpQuizStatsResponse(1, 4.0, 0, 100, 80, 80, 80, 60);
        when(mockService.submit(anyInt(), anyInt(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(Mono.just(stats));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("totalQuestions", 5);
        body.put("correctCount", 4);
        body.put("q1Correct", true);
        body.put("q2Correct", true);
        body.put("q3Correct", true);
        body.put("q4Correct", true);
        body.put("q5Correct", false);

        client.post().uri("/ehp-quiz/submit")
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
        client.post().uri("/ehp-quiz/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_total_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("totalQuestions", 0);
        body.put("correctCount", 0);

        client.post().uri("/ehp-quiz/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_correct_exceeds_total_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("totalQuestions", 5);
        body.put("correctCount", 6);

        client.post().uri("/ehp-quiz/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyInt(), anyInt(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean(), anyBoolean()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("totalQuestions", 5);
        body.put("correctCount", 3);
        body.put("q1Correct", true);
        body.put("q2Correct", false);
        body.put("q3Correct", true);
        body.put("q4Correct", false);
        body.put("q5Correct", true);

        client.post().uri("/ehp-quiz/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        EhpQuizStatsResponse stats = new EhpQuizStatsResponse(10, 3.5, 20.0, 90.0, 70.0, 80.0, 60.0, 40.0);
        when(mockService.stats()).thenReturn(Mono.just(stats));

        client.get().uri("/ehp-quiz/stats")
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

        client.get().uri("/ehp-quiz/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
