package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.EventResponses.EventCollectResponse;
import run.runnable.numfeelservice.controller.dto.EventResponses.EventSummaryResponse;
import run.runnable.numfeelservice.service.EventCollectService;
import run.runnable.numfeelservice.service.EventSummaryService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EventControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EventCollectService mockCollectService;
    private EventSummaryService mockSummaryService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockCollectService = mock(EventCollectService.class);
        mockSummaryService = mock(EventSummaryService.class);
        client = WebTestClient.bindToController(new EventController(mockCollectService, mockSummaryService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_validBatch_returnsAcceptedCount() {
        when(mockCollectService.collect(anyString(), anyString(), any(), anyString()))
                .thenReturn(Mono.just(new EventCollectResponse(1, 0)));

        ArrayNode events = MAPPER.createArrayNode();
        ObjectNode e = MAPPER.createObjectNode();
        e.put("name", "press");
        e.put("seq", 1);
        events.add(e);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("demo", "wealth-button-paradox");
        body.put("sessionId", "aB3x9Kd2mQ7z");
        body.set("events", events);

        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_nullBody_returns400() {
        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalidDemo_returns400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("demo", "Invalid_Demo!");
        body.put("sessionId", "aB3x9Kd2mQ7z");
        body.set("events", MAPPER.createArrayNode());

        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalidSessionId_returns400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("demo", "wealth-button-paradox");
        body.put("sessionId", "short");
        body.set("events", MAPPER.createArrayNode());

        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_eventsOver100_truncatedBeforeReachingService() {
        when(mockCollectService.collect(anyString(), anyString(), any(), anyString()))
                .thenReturn(Mono.just(new EventCollectResponse(100, 0)));

        ArrayNode events = MAPPER.createArrayNode();
        for (int i = 0; i < 150; i++) {
            ObjectNode e = MAPPER.createObjectNode();
            e.put("name", "press");
            e.put("seq", i + 1);
            events.add(e);
        }

        ObjectNode body = MAPPER.createObjectNode();
        body.put("demo", "wealth-button-paradox");
        body.put("sessionId", "aB3x9Kd2mQ7z");
        body.set("events", events);

        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void post_serviceFailure_returns500() {
        when(mockCollectService.collect(anyString(), anyString(), any(), anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        ArrayNode events = MAPPER.createArrayNode();
        ObjectNode e = MAPPER.createObjectNode();
        e.put("name", "press");
        e.put("seq", 1);
        events.add(e);

        ObjectNode body = MAPPER.createObjectNode();
        body.put("demo", "wealth-button-paradox");
        body.put("sessionId", "aB3x9Kd2mQ7z");
        body.set("events", events);

        client.post().uri("/events/collect")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void get_summary_returnsData() {
        when(mockSummaryService.summary("wealth-button-paradox"))
                .thenReturn(Mono.just(new EventSummaryResponse(10, 50, Map.of("press", 40L))));

        client.get().uri("/events/summary?demo=wealth-button-paradox")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void get_summary_invalidDemo_returns400() {
        client.get().uri("/events/summary?demo=Invalid!")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void get_summary_serviceFailure_returns500() {
        when(mockSummaryService.summary(anyString()))
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/events/summary?demo=wealth-button-paradox")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
