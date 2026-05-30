package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.CaptchaStatsService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CaptchaStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CaptchaStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(CaptchaStatsService.class);
        client = WebTestClient.bindToController(new CaptchaStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(any()))
                .thenReturn(Mono.empty());

        ObjectNode levels = MAPPER.createObjectNode();
        levels.put("text", 1);
        levels.put("math", 1);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("passedCount", 4);
        body.put("totalTimeMs", 30000);
        body.put("grade", "A");
        body.set("levels", levels);

        client.post().uri("/captcha/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/captcha/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_passedCount_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("passedCount", 10);
        body.put("totalTimeMs", 30000);
        body.put("grade", "A");
        body.set("levels", MAPPER.createObjectNode());

        client.post().uri("/captcha/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_levels_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("passedCount", 4);
        body.put("totalTimeMs", 30000);
        body.put("grade", "A");

        client.post().uri("/captcha/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(any()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode levels = MAPPER.createObjectNode();
        ObjectNode body = MAPPER.createObjectNode();
        body.put("passedCount", 4);
        body.put("totalTimeMs", 30000);
        body.put("grade", "A");
        body.set("levels", levels);

        client.post().uri("/captcha/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/captcha/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/captcha/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
