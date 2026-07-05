package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerSubmitResponse;
import run.runnable.numfeelservice.service.SwitchAnswerStatsService;
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

class SwitchAnswerStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SwitchAnswerStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SwitchAnswerStatsService.class);
        client = WebTestClient.bindToController(new SwitchAnswerStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private ObjectNode validBody() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("strategy", "switch");
        body.put("won", true);
        body.put("options", 4);
        body.put("eliminated", 2);
        return body;
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(anyString(), anyBoolean(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.just(new SwitchAnswerSubmitResponse(
                        1, 0, 0, 0.0, 1, 1, 1.0, System.currentTimeMillis())));

        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_strategy_returns_400() {
        ObjectNode body = validBody();
        body.put("strategy", "maybe");
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_strategy_returns_400() {
        ObjectNode body = validBody();
        body.remove("strategy");
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_won_returns_400() {
        ObjectNode body = validBody();
        body.remove("won");
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_options_out_of_range_returns_400() {
        ObjectNode body = validBody();
        body.put("options", 7);
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_eliminated_out_of_range_returns_400() {
        ObjectNode body = validBody();
        body.put("options", 4);
        body.put("eliminated", 3); // 4-2=2 为上限
        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyBoolean(), anyInt(), anyInt(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        client.post().uri("/switch-answer/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.just(new SwitchAnswerStatsResponse(
                0, 0, 0, 0.0, 0, 0, 0.0, 0L, List.of())));

        client.get().uri("/switch-answer/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/switch-answer/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
