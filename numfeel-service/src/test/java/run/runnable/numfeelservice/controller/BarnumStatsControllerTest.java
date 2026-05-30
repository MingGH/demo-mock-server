package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.BarnumStatsService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BarnumStatsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private BarnumStatsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(BarnumStatsService.class);
        client = WebTestClient.bindToController(new BarnumStatsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(eq("tarot"), anyInt(), anyInt(), anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.empty());

        ObjectNode body = MAPPER.createObjectNode();
        body.put("userGroup", "tarot");
        body.put("rating1", 4);
        body.put("rating2", 5);
        body.put("rating3", 3);
        body.put("rating4", 4);
        body.put("rating5", 5);

        client.post().uri("/barnum-test/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.submitted").isEqualTo(true);
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/barnum-test/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_userGroup_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("userGroup", "invalid");
        body.put("rating1", 4);
        body.put("rating2", 5);
        body.put("rating3", 3);
        body.put("rating4", 4);
        body.put("rating5", 5);

        client.post().uri("/barnum-test/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_rating_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("userGroup", "random");
        body.put("rating1", 6);
        body.put("rating2", 5);
        body.put("rating3", 3);
        body.put("rating4", 4);
        body.put("rating5", 5);

        client.post().uri("/barnum-test/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(anyString(), anyInt(), anyInt(), anyInt(), anyInt(), anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("userGroup", "tarot");
        body.put("rating1", 4);
        body.put("rating2", 5);
        body.put("rating3", 3);
        body.put("rating4", 4);
        body.put("rating5", 5);

        client.post().uri("/barnum-test/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/barnum-test/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/barnum-test/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
