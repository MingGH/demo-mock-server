package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.model.SocialEngineeringRecord;
import run.runnable.numfeelservice.service.SocialEngineeringService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SocialEngineeringControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SocialEngineeringService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SocialEngineeringService.class);
        client = WebTestClient.bindToController(new SocialEngineeringController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_submits_success() {
        when(mockService.submit(any(SocialEngineeringRecord.class)))
                .thenReturn(Mono.empty());

        ArrayNode questions = MAPPER.createArrayNode();
        ObjectNode q = MAPPER.createObjectNode();
        q.put("questionId", 1);
        q.put("tactic", "phishing");
        q.put("isFake", true);
        q.put("correct", true);
        questions.add(q);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "550e8400-e29b-41d4-a716-446655440000");
        body.put("total", 10);
        body.put("correct", 7);
        body.set("questions", questions);

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_sessionId_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "not-a-uuid");
        body.put("total", 10);
        body.put("correct", 7);
        body.set("questions", MAPPER.createArrayNode());

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_total_out_of_range_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "550e8400-e29b-41d4-a716-446655440000");
        body.put("total", 25);
        body.put("correct", 7);
        body.set("questions", MAPPER.createArrayNode());

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_no_questions_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "550e8400-e29b-41d4-a716-446655440000");
        body.put("total", 10);
        body.put("correct", 7);

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_empty_questions_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "550e8400-e29b-41d4-a716-446655440000");
        body.put("total", 10);
        body.put("correct", 7);
        body.set("questions", MAPPER.createArrayNode());

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_service_failure_returns_500() {
        when(mockService.submit(any(SocialEngineeringRecord.class)))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ArrayNode questions = MAPPER.createArrayNode();
        ObjectNode q = MAPPER.createObjectNode();
        q.put("questionId", 1);
        q.put("tactic", "phishing");
        q.put("isFake", true);
        q.put("correct", true);
        questions.add(q);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("sessionId", "550e8400-e29b-41d4-a716-446655440000");
        body.put("total", 10);
        body.put("correct", 7);
        body.set("questions", questions);

        client.post().uri("/social-engineering/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_stats_returns_data() {
        when(mockService.stats()).thenReturn(Mono.empty());

        client.get().uri("/social-engineering/stats")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_stats_service_failure_returns_500() {
        when(mockService.stats()).thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/social-engineering/stats")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
