package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.NewcombService;
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

class NewcombControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private NewcombService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(NewcombService.class);
        when(mockService.isValidChoice(anyString())).thenReturn(false);
        client = WebTestClient.bindToController(new NewcombController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.isValidChoice(anyString())).thenReturn(true);
        when(mockService.submit(anyString(), anyString(), anyBoolean(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("choice", "one");
        body.put("prediction", "one");
        body.put("hit", true);
        body.put("payoff", 1000000);

        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_choice_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("choice", "three");
        body.put("prediction", "one");
        body.put("hit", true);
        body.put("payoff", 1000000);

        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_hit_returns_400() {
        when(mockService.isValidChoice(anyString())).thenReturn(true);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("choice", "one");
        body.put("prediction", "one");
        body.put("payoff", 1000000);

        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_payoff_returns_400() {
        when(mockService.isValidChoice(anyString())).thenReturn(true);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("choice", "one");
        body.put("prediction", "one");
        body.put("hit", true);
        body.put("payoff", -1);

        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.isValidChoice(anyString())).thenReturn(true);
        when(mockService.submit(anyString(), anyString(), anyBoolean(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("choice", "two");
        body.put("prediction", "two");
        body.put("hit", false);
        body.put("payoff", 1000);

        client.post().uri("/newcomb/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/newcomb/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/newcomb/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
