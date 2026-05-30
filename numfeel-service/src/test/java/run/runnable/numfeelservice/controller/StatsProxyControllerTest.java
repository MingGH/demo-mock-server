package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import java.util.function.Function;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * StatsProxyController HTTP 层测试，mock WebClient。
 */
class StatsProxyControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private WebClient mockWebClient;
    private WebClient.RequestBodyUriSpec mockPostUriSpec;
    private WebClient.ResponseSpec mockResponseSpec;
    private WebTestClient client;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        mockWebClient = mock(WebClient.class);
        mockPostUriSpec = mock(WebClient.RequestBodyUriSpec.class);
        mockResponseSpec = mock(WebClient.ResponseSpec.class);

        WebClient.RequestHeadersUriSpec mockGetUriSpec = mock(WebClient.RequestHeadersUriSpec.class);
        WebClient.RequestHeadersSpec mockGetHeadersSpec = mock(WebClient.RequestHeadersSpec.class);
        WebClient.RequestBodySpec mockPostBodySpec = mock(WebClient.RequestBodySpec.class);

        when(mockWebClient.get()).thenReturn(mockGetUriSpec);
        when(mockGetUriSpec.uri(any(Function.class))).thenReturn(mockGetHeadersSpec);
        when(mockGetUriSpec.uri(anyString())).thenReturn(mockGetHeadersSpec);
        when(mockGetHeadersSpec.header(anyString(), anyString())).thenReturn(mockGetHeadersSpec);
        when(mockGetHeadersSpec.retrieve()).thenReturn(mockResponseSpec);

        when(mockWebClient.post()).thenReturn(mockPostUriSpec);
        when(mockPostUriSpec.uri(any(Function.class))).thenReturn(mockPostBodySpec);
        when(mockPostBodySpec.header(anyString(), anyString())).thenReturn(mockPostBodySpec);
        when(mockPostBodySpec.retrieve()).thenReturn(mockResponseSpec);

        client = WebTestClient.bindToController(new StatsProxyController(mockWebClient, "fake-token"))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private ObjectNode counterNode() {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("status", 200);
        node.put("data", 42);
        return node;
    }

    @Test
    void handleGetAll_returns_aggregated_data() {
        ObjectNode playerNode = MAPPER.createObjectNode();
        playerNode.put("status", 200);
        playerNode.put("data", 150);

        ObjectNode bankruptNode = MAPPER.createObjectNode();
        bankruptNode.put("status", 200);
        bankruptNode.put("data", 30);

        ObjectNode billionaireNode = MAPPER.createObjectNode();
        billionaireNode.put("status", 200);
        billionaireNode.put("data", 5);

        when(mockResponseSpec.bodyToMono(JsonNode.class))
                .thenReturn(Mono.just(playerNode))
                .thenReturn(Mono.just(bankruptNode))
                .thenReturn(Mono.just(billionaireNode));

        client.get().uri("/stats?action=getAll")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.players").isEqualTo(150)
                .jsonPath("$.data.bankrupt").isEqualTo(30)
                .jsonPath("$.data.billionaire").isEqualTo(5);
    }

    @Test
    void handleGet_valid_key_returns_data() {
        when(mockResponseSpec.bodyToMono(JsonNode.class)).thenReturn(Mono.just(counterNode()));

        client.get().uri("/stats?action=get&key=wealth-btn-players")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data").isEqualTo(42);
    }

    @Test
    void handleGet_invalid_key_returns_400() {
        client.get().uri("/stats?action=get&key=invalid-key")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void handleGet_missing_key_returns_400() {
        client.get().uri("/stats?action=get")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void handleIncr_returns_ok() {
        ObjectNode resultNode = MAPPER.createObjectNode();
        resultNode.put("status", 200);
        resultNode.put("data", 151);
        when(mockResponseSpec.bodyToMono(JsonNode.class)).thenReturn(Mono.just(resultNode));

        client.post().uri("/stats?action=incr&key=wealth-btn-players&n=1")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data").isEqualTo(151);
    }

    @Test
    void handleIncr_invalid_key_returns_400() {
        client.post().uri("/stats?action=incr&key=bad-key")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void dispatch_missing_action_returns_400() {
        client.get().uri("/stats")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void dispatch_invalid_action_returns_400() {
        client.get().uri("/stats?action=delete")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void handleGetAll_upstream_error_returns_500() {
        when(mockResponseSpec.bodyToMono(JsonNode.class))
                .thenReturn(Mono.error(new RuntimeException("Upstream error")));

        client.get().uri("/stats?action=getAll")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
