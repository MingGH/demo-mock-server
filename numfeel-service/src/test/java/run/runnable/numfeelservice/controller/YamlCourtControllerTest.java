package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import run.runnable.numfeelservice.service.YamlCourtService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import reactor.core.publisher.Mono;

/**
 * {@link YamlCourtController} 切片测试：bindToController + 全局异常处理器。
 */
class YamlCourtControllerTest {

    private YamlCourtService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(YamlCourtService.class);
        client = WebTestClient.bindToController(new YamlCourtController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void parse_valid_yaml_returns_200_envelope() {
        when(mockService.parse(anyString())).thenReturn(Mono.just(YamlParseFixtures.okResponse()));

        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"yaml\":\"country: no\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.ok").isEqualTo(true)
                .jsonPath("$.data.parser").isEqualTo(YamlCourtService.PARSER_LABEL)
                .jsonPath("$.data.rootKind").isEqualTo("mapping")
                .jsonPath("$.data.values[0].key").isEqualTo("country")
                .jsonPath("$.data.values[0].type").isEqualTo("boolean")
                .jsonPath("$.data.values[0].value").isEqualTo("false");
    }

    @Test
    void parse_yaml_error_maps_to_ok_false_payload() {
        when(mockService.parse(anyString())).thenReturn(Mono.just(YamlParseFixtures.errorResponse()));

        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"yaml\":\"server:\\n\\tport: 8080\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.ok").isEqualTo(false)
                .jsonPath("$.data.error").isEqualTo("found character that cannot start any token")
                .jsonPath("$.data.errorLine").isEqualTo(2)
                .jsonPath("$.data.values").isEmpty();
    }

    @Test
    void parse_null_body_returns_400() {
        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void parse_blank_yaml_returns_400() {
        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"yaml\":\"   \"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void parse_missing_yaml_field_returns_400() {
        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void parse_oversized_yaml_returns_400() {
        String big = "x".repeat(65_001);
        String body = "{\"yaml\":\"" + big + "\"}";

        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isEqualTo(400)
                .expectBody()
                .jsonPath("$.message").isEqualTo("YAML too large (max 64KB)");
    }

    @Test
    void parse_non_utf8_yaml_still_parsed() {
        when(mockService.parse(anyString())).thenReturn(Mono.just(YamlParseFixtures.okResponse()));

        client.post().uri("/yaml-court/parse")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"yaml\":\"name: 静夜思\"}".getBytes(StandardCharsets.UTF_8))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200);
    }

    /** 测试夹具：构造两种典型响应 DTO，避免 mock 里出现真实解析依赖。 */
    private static final class YamlParseFixtures {

        private static run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse okResponse() {
            return run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse.builder()
                    .ok(true)
                    .parser(YamlCourtService.PARSER_LABEL)
                    .rootKind("mapping")
                    .values(java.util.List.of(
                            new run.runnable.numfeelservice.controller.dto.YamlResponses.YamlValueEntry(
                                    "country", "false", "boolean", "java.lang.Boolean")))
                    .build();
        }

        private static run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse errorResponse() {
            return run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse.builder()
                    .ok(false)
                    .error("found character that cannot start any token")
                    .errorLine(2)
                    .parser(YamlCourtService.PARSER_LABEL)
                    .build();
        }
    }
}
