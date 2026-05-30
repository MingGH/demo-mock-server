package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.WordCloudEntryResponse;
import run.runnable.numfeelservice.service.WordCloudService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * WordCloudController HTTP 层测试，mock WordCloudService。
 */
class WordCloudControllerTest {

    private WordCloudService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(WordCloudService.class);
        client = WebTestClient.bindToController(new WordCloudController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void wordCloud_without_search_returns_top300() throws IOException {
        List<WordCloudEntryResponse> top300 = List.of(
                new WordCloudEntryResponse("经济", 150),
                new WordCloudEntryResponse("市场", 120),
                new WordCloudEntryResponse("政策", 100)
        );
        Map<String, Integer> fullCounts = Map.of("经济", 150, "市场", 120, "政策", 100);
        WordCloudService.WordCloudData data = new WordCloudService.WordCloudData(top300, fullCounts);
        when(mockService.getOrLoad()).thenReturn(data);

        client.get().uri("/word-cloud")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].name").isEqualTo("经济")
                .jsonPath("$[0].value").isEqualTo(150)
                .jsonPath("$[2].name").isEqualTo("政策");
    }

    @Test
    void wordCloud_with_search_returns_search_result() throws IOException {
        List<WordCloudEntryResponse> top300 = List.of(
                new WordCloudEntryResponse("经济", 150),
                new WordCloudEntryResponse("市场", 120)
        );
        Map<String, Integer> fullCounts = Map.of("经济", 150, "市场", 120);
        WordCloudService.WordCloudData data = new WordCloudService.WordCloudData(top300, fullCounts);
        when(mockService.getOrLoad()).thenReturn(data);

        client.get().uri("/word-cloud?search=经济")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.word").isEqualTo("经济")
                .jsonPath("$.count").isEqualTo(150)
                .jsonPath("$.inTop300").isEqualTo(true);
    }

    @Test
    void wordCloud_search_not_in_top300() throws IOException {
        List<WordCloudEntryResponse> top300 = List.of(
                new WordCloudEntryResponse("经济", 150)
        );
        Map<String, Integer> fullCounts = Map.of("经济", 150, "罕见词", 3);
        WordCloudService.WordCloudData data = new WordCloudService.WordCloudData(top300, fullCounts);
        when(mockService.getOrLoad()).thenReturn(data);

        client.get().uri("/word-cloud?search=罕见词")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.word").isEqualTo("罕见词")
                .jsonPath("$.count").isEqualTo(3)
                .jsonPath("$.inTop300").isEqualTo(false);
    }

    @Test
    void wordCloud_service_failure_returns_500() throws IOException {
        when(mockService.getOrLoad()).thenThrow(new RuntimeException("Data load failed"));

        client.get().uri("/word-cloud")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
