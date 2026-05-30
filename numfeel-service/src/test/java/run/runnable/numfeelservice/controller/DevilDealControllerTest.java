package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.DevilDealService;
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

class DevilDealControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private DevilDealService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(DevilDealService.class);
        when(mockService.isValidType(anyString())).thenReturn(false);
        when(mockService.isValidPct(anyInt())).thenReturn(false);
        client = WebTestClient.bindToController(new DevilDealController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.isValidType(anyString())).thenReturn(true);
        when(mockService.isValidPct(anyInt())).thenReturn(true);
        when(mockService.submit(anyString(), anyString(), anyInt(), anyInt(), anyInt(),
                anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("dealType", "power");
        body.put("secondType", "money");
        body.put("powerPct", 30);
        body.put("lovePct", 20);
        body.put("moneyPct", 15);
        body.put("revengePct", 10);
        body.put("recognitionPct", 15);
        body.put("knowledgePct", 10);

        client.post().uri("/devil-deal/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/devil-deal/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_dealType_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("dealType", "invalid");
        body.put("secondType", "money");
        body.put("powerPct", 30);
        body.put("lovePct", 20);
        body.put("moneyPct", 15);
        body.put("revengePct", 10);
        body.put("recognitionPct", 15);
        body.put("knowledgePct", 10);

        client.post().uri("/devil-deal/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_pct_returns_400() {
        when(mockService.isValidType(anyString())).thenReturn(true);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("dealType", "power");
        body.put("secondType", "money");
        body.put("powerPct", 150);
        body.put("lovePct", 20);
        body.put("moneyPct", 15);
        body.put("revengePct", 10);
        body.put("recognitionPct", 15);
        body.put("knowledgePct", 10);

        client.post().uri("/devil-deal/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.isValidType(anyString())).thenReturn(true);
        when(mockService.isValidPct(anyInt())).thenReturn(true);
        when(mockService.submit(anyString(), anyString(), anyInt(), anyInt(), anyInt(),
                anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("dealType", "knowledge");
        body.put("secondType", "love");
        body.put("powerPct", 20);
        body.put("lovePct", 25);
        body.put("moneyPct", 15);
        body.put("revengePct", 10);
        body.put("recognitionPct", 15);
        body.put("knowledgePct", 15);

        client.post().uri("/devil-deal/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/devil-deal/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/devil-deal/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
