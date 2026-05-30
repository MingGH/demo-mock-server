package run.runnable.numfeelservice.controller;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * QuantumController HTTP 层测试，mock WebClient。
 */
class QuantumControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private WebClient mockWebClient;
    private WebClient.RequestHeadersUriSpec mockUriSpec;
    private WebClient.RequestHeadersSpec mockHeadersSpec;
    private WebClient.ResponseSpec mockResponseSpec;
    private WebTestClient client;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        mockWebClient = mock(WebClient.class);
        mockUriSpec = mock(WebClient.RequestHeadersUriSpec.class);
        mockHeadersSpec = mock(WebClient.RequestHeadersSpec.class);
        mockResponseSpec = mock(WebClient.ResponseSpec.class);

        when(mockWebClient.get()).thenReturn(mockUriSpec);
        when(mockUriSpec.uri(anyString())).thenReturn(mockHeadersSpec);
        when(mockUriSpec.uri(any(java.util.function.Function.class))).thenReturn(mockHeadersSpec);
        when(mockHeadersSpec.header(anyString(), anyString())).thenReturn(mockHeadersSpec);
        when(mockHeadersSpec.retrieve()).thenReturn(mockResponseSpec);

        client = WebTestClient.bindToController(new QuantumController(mockWebClient, "fake-token"))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void numbers_default_params_returns_200() {
        ArrayNode numbers = MAPPER.createArrayNode();
        for (int i = 0; i < 10; i++) {
            numbers.add(42 + i);
        }
        when(mockResponseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(numbers));

        client.get().uri("/quantum/numbers")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.length()").isEqualTo(10)
                .jsonPath("$.source").isEqualTo("quantum")
                .jsonPath("$.provider").isEqualTo("ANU QRNG");
    }

    @Test
    void numbers_unique_returns_200() {
        ArrayNode numbers = MAPPER.createArrayNode();
        for (int i = 0; i < 15; i++) {
            numbers.add(10 + i);
        }
        when(mockResponseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(numbers));

        client.get().uri("/quantum/numbers?count=5&min=10&max=20&unique=true")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.length()").isEqualTo(5);
    }

    @Test
    void numbers_invalid_min_greater_than_max_returns_400() {
        client.get().uri("/quantum/numbers?min=100&max=50")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void numbers_unique_range_too_small_returns_400() {
        client.get().uri("/quantum/numbers?count=10&min=1&max=5&unique=true")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void numbers_count_out_of_range_returns_400() {
        client.get().uri("/quantum/numbers?count=5000")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void numbers_upstream_error_fallback_returns_200() {
        when(mockResponseSpec.bodyToMono(ArrayNode.class))
                .thenReturn(Mono.error(new RuntimeException("Network error")));

        client.get().uri("/quantum/numbers?count=5")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.source").isEqualTo("pseudo")
                .jsonPath("$.data.length()").isEqualTo(5);
    }

    @SuppressWarnings("unchecked")
    @Test
    void available_returns_200() {
        WebClient.RequestHeadersUriSpec mockAvailUriSpec = mock(WebClient.RequestHeadersUriSpec.class);
        WebClient.RequestHeadersSpec mockAvailHeadersSpec = mock(WebClient.RequestHeadersSpec.class);

        when(mockWebClient.get()).thenReturn(mockAvailUriSpec);
        when(mockAvailUriSpec.uri("/random/available")).thenReturn(mockAvailHeadersSpec);
        when(mockAvailHeadersSpec.header(anyString(), anyString())).thenReturn(mockAvailHeadersSpec);

        var mockAvailResp = mock(org.springframework.web.reactive.function.client.ClientResponse.class);
        when(mockAvailResp.bodyToMono(tools.jackson.databind.JsonNode.class))
                .thenReturn(Mono.just(MAPPER.createObjectNode().put("available", 5000)));

        when(mockAvailHeadersSpec.exchangeToMono(any()))
                .thenAnswer(inv -> {
                    var fn = inv.getArgument(0, java.util.function.Function.class);
                    return ((Mono<?>) fn.apply(mockAvailResp));
                });

        client.get().uri("/quantum/available")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void available_upstream_error_returns_500() {
        when(mockHeadersSpec.exchangeToMono(any()))
                .thenReturn(Mono.error(new RuntimeException("API unreachable")));

        client.get().uri("/quantum/available")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
