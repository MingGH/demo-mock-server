package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.AnalyzeResponse;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.CacheInfo;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.CachedResult;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.ContentItem;
import run.runnable.numfeelservice.service.ZhihuAnalyzeService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * ZhihuAnalyzeController HTTP 层测试：mock Service，验证请求头解析与错误处理。
 */
class ZhihuAnalyzeControllerTest {

    private ZhihuAnalyzeService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(ZhihuAnalyzeService.class);
        client = WebTestClient.bindToController(new ZhihuAnalyzeController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void analyze_success_returns_200() {
        AnalyzeResponse response = new AnalyzeResponse(
                List.of(new ContentItem("article", "https://zhihu.com/p/123", 1673740800L, 100, 20, 10, "Test", "Summary")),
                1, 1673740800L, 1673740800L, 100, 20, 10,
                Map.of("article", 1), Map.of("2023", 1), Map.of("2023-01", 1),
                List.of(), List.of(), List.of(),
                List.of(), List.of()
        );
        when(mockService.analyze(eq("my-secret-token"), eq(false)))
                .thenReturn(Mono.just(new CachedResult(response,
                        new CacheInfo(false, 1673740800L, 1673741700L, 900))));

        client.post().uri("/zhihu/analyze")
                .header("Authorization", "Bearer my-secret-token")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.total").isEqualTo(1)
                .jsonPath("$.data.totalLikes").isEqualTo(100);
    }

    @Test
    void analyze_missing_auth_header_returns_400() {
        client.post().uri("/zhihu/analyze")
                .exchange()
                .expectStatus().isEqualTo(400)
                .expectBody()
                .jsonPath("$.message").exists();
    }

    @Test
    void analyze_empty_bearer_returns_400() {
        client.post().uri("/zhihu/analyze")
                .header("Authorization", "Bearer ")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void analyze_without_bearer_prefix_still_works() {
        AnalyzeResponse response = new AnalyzeResponse(
                List.of(), 0, 0, 0, 0, 0, 0,
                Map.of(), Map.of(), Map.of(),
                List.of(), List.of(), List.of(),
                List.of(), List.of()
        );
        when(mockService.analyze(eq("raw-token"), eq(false)))
                .thenReturn(Mono.just(new CachedResult(response,
                        new CacheInfo(false, 0L, 900L, 900))));

        client.post().uri("/zhihu/analyze")
                .header("Authorization", "raw-token")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200);
    }

    @Test
    void analyze_service_api_exception_returns_business_error() {
        when(mockService.analyze(anyString(), eq(false)))
                .thenReturn(Mono.error(ApiException.badRequest("Access Secret 无效")));

        client.post().uri("/zhihu/analyze")
                .header("Authorization", "Bearer bad-token")
                .exchange()
                .expectStatus().isEqualTo(400)
                .expectBody()
                .jsonPath("$.message").isEqualTo("Access Secret 无效");
    }

    @Test
    void analyze_service_unexpected_error_returns_500() {
        when(mockService.analyze(anyString(), eq(false)))
                .thenReturn(Mono.error(new RuntimeException("connection refused")));

        client.post().uri("/zhihu/analyze")
                .header("Authorization", "Bearer some-token")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
