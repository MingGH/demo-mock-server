package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.InceptionMazeService;
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

class InceptionMazeControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private InceptionMazeService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(InceptionMazeService.class);
        client = WebTestClient.bindToController(new InceptionMazeController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(any()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("gridSize", 10);
        body.put("pathLength", 50);
        body.put("minPath", 20);
        body.put("detourRatio", 2.5);
        body.put("dreamLevel", 3);
        body.put("wallCount", 30);

        client.post().uri("/inception-maze/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/inception-maze/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_gridSize_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("gridSize", 3);
        body.put("pathLength", 50);
        body.put("minPath", 20);
        body.put("detourRatio", 2.5);
        body.put("dreamLevel", 3);
        body.put("wallCount", 30);

        client.post().uri("/inception-maze/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_detourRatio_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("gridSize", 10);
        body.put("pathLength", 50);
        body.put("minPath", 20);
        body.put("detourRatio", 0.2);
        body.put("dreamLevel", 3);
        body.put("wallCount", 30);

        client.post().uri("/inception-maze/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(any()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("gridSize", 10);
        body.put("pathLength", 50);
        body.put("minPath", 20);
        body.put("detourRatio", 2.5);
        body.put("dreamLevel", 3);
        body.put("wallCount", 30);

        client.post().uri("/inception-maze/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/inception-maze/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/inception-maze/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
