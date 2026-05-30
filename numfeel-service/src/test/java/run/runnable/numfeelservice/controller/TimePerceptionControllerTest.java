package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.TimePerceptionService;
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

class TimePerceptionControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TimePerceptionService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(TimePerceptionService.class);
        client = WebTestClient.bindToController(new TimePerceptionController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyInt(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), anyDouble(), anyString(), anyString()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Tester");
        body.put("totalScore", 85);
        body.put("weberScore", 0.12);
        body.put("avgAbsDistortion", 0.3);
        body.put("blankAvgDistortion", 0.2);
        body.put("loadAvgDistortion", 0.4);
        body.put("emotionAvgDistortion", 0.5);
        body.put("biasDirection", "overestimator");
        body.put("grade", "S");

        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_empty_name_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "");
        body.put("totalScore", 85);
        body.put("weberScore", 0.12);
        body.put("avgAbsDistortion", 0.3);
        body.put("blankAvgDistortion", 0.2);
        body.put("loadAvgDistortion", 0.4);
        body.put("emotionAvgDistortion", 0.5);
        body.put("biasDirection", "overestimator");
        body.put("grade", "S");

        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_totalScore_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Tester");
        body.put("totalScore", 150);
        body.put("weberScore", 0.12);
        body.put("avgAbsDistortion", 0.3);
        body.put("blankAvgDistortion", 0.2);
        body.put("loadAvgDistortion", 0.4);
        body.put("emotionAvgDistortion", 0.5);
        body.put("biasDirection", "underestimator");
        body.put("grade", "A");

        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_biasDirection_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Tester");
        body.put("totalScore", 85);
        body.put("weberScore", 0.12);
        body.put("avgAbsDistortion", 0.3);
        body.put("blankAvgDistortion", 0.2);
        body.put("loadAvgDistortion", 0.4);
        body.put("emotionAvgDistortion", 0.5);
        body.put("biasDirection", "unknown");
        body.put("grade", "S");

        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), anyDouble(), anyString(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Tester");
        body.put("totalScore", 85);
        body.put("weberScore", 0.12);
        body.put("avgAbsDistortion", 0.3);
        body.put("blankAvgDistortion", 0.2);
        body.put("loadAvgDistortion", 0.4);
        body.put("emotionAvgDistortion", 0.5);
        body.put("biasDirection", "balanced");
        body.put("grade", "A");

        client.post().uri("/time-perception/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/time-perception/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/time-perception/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_leaderboard_without_limit_returns_data() {
        when(mockService.leaderboard(20)).thenReturn(Mono.empty());

        client.get().uri("/time-perception/leaderboard")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_leaderboard_with_limit_returns_data() {
        when(mockService.leaderboard(10)).thenReturn(Mono.empty());

        client.get().uri("/time-perception/leaderboard?limit=10")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_leaderboard_service_failure_returns_500() {
        when(mockService.leaderboard(anyInt())).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/time-perception/leaderboard")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
