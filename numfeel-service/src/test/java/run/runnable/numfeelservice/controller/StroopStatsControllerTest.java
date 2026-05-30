package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.StroopStatsService;
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

class StroopStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private StroopStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(StroopStatsService.class);
        client = WebTestClient.bindToController(new StroopStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyInt(), anyInt(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), anyDouble(), anyString()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("total", 30);
        body.put("correctCount", 28);
        body.put("accuracy", 0.93);
        body.put("avgRT", 450.0);
        body.put("conAvgRT", 400.0);
        body.put("incAvgRT", 550.0);
        body.put("stroopEffect", 150.0);
        body.put("grade", "S");

        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_total_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("total", 200);
        body.put("correctCount", 28);
        body.put("accuracy", 0.93);
        body.put("avgRT", 450.0);
        body.put("conAvgRT", 400.0);
        body.put("incAvgRT", 550.0);
        body.put("stroopEffect", 150.0);
        body.put("grade", "S");

        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_correctCount_exceeds_total_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("total", 30);
        body.put("correctCount", 40);
        body.put("accuracy", 0.93);
        body.put("avgRT", 450.0);
        body.put("conAvgRT", 400.0);
        body.put("incAvgRT", 550.0);
        body.put("stroopEffect", 150.0);
        body.put("grade", "S");

        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_blank_grade_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("total", 30);
        body.put("correctCount", 28);
        body.put("accuracy", 0.93);
        body.put("avgRT", 450.0);
        body.put("conAvgRT", 400.0);
        body.put("incAvgRT", 550.0);
        body.put("stroopEffect", 150.0);
        body.put("grade", "");

        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyInt(), anyInt(), anyDouble(), anyDouble(), anyDouble(),
                anyDouble(), anyDouble(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("total", 30);
        body.put("correctCount", 28);
        body.put("accuracy", 0.93);
        body.put("avgRT", 450.0);
        body.put("conAvgRT", 400.0);
        body.put("incAvgRT", 550.0);
        body.put("stroopEffect", 150.0);
        body.put("grade", "A");

        client.post().uri("/stroop/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/stroop/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/stroop/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
