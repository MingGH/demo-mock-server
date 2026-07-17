package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IqMatrixSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IqMatrixTopResponse;
import run.runnable.numfeelservice.service.IqMatrixLeaderboardService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IqMatrixLeaderboardControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private IqMatrixLeaderboardService service;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        service = mock(IqMatrixLeaderboardService.class);
        client = WebTestClient.bindToController(new IqMatrixLeaderboardController(service))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void submitValidScoreReturnsAuthoritativeResult() {
        when(service.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.just(new IqMatrixSubmitResponse(3, 42, 81)));

        client.post().uri("/iq-matrix/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.rank").isEqualTo(3)
                .jsonPath("$.data.total").isEqualTo(42)
                .jsonPath("$.data.overallScore").isEqualTo(81);
    }

    @Test
    void submitRejectsAccuracyThatCannotComeFromNineQuestions() {
        ObjectNode body = validBody();
        body.put("matrixAccuracy", 75);
        postExpectBadRequest(body, "invalid matrixAccuracy");
    }

    @Test
    void submitRejectsImpossibleReactionTime() {
        ObjectNode body = validBody();
        body.put("avgReactionMs", 50);
        postExpectBadRequest(body, "invalid avgReactionMs");
    }

    @Test
    void submitRejectsOutOfRangeWorkingMemoryAccuracy() {
        ObjectNode body = validBody();
        body.put("wmAccuracy", 101);
        postExpectBadRequest(body, "invalid wmAccuracy");
    }

    @Test
    void submitRejectsMissingTurnstileToken() {
        ObjectNode body = validBody();
        body.put("cfTurnstileToken", "");
        postExpectBadRequest(body, "cfTurnstileToken is required");
    }

    @Test
    void submitRejectsNameLongerThanTwentyFourUnicodeCodePoints() {
        ObjectNode body = validBody();
        body.put("name", "测".repeat(25));
        postExpectBadRequest(body, "name must not exceed 24 characters");
    }

    @Test
    void submitSanitizesMarkupAndWhitespaceBeforeService() {
        when(service.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.just(new IqMatrixSubmitResponse(1, 1, 90)));
        ObjectNode body = validBody();
        body.put("name", "  <玩>   家  ");

        client.post().uri("/iq-matrix/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();

        verify(service).submit(org.mockito.ArgumentMatchers.eq("玩 家"),
                org.mockito.ArgumentMatchers.eq(78),
                org.mockito.ArgumentMatchers.eq(9000),
                org.mockito.ArgumentMatchers.eq(85),
                org.mockito.ArgumentMatchers.eq("token"),
                anyString());
    }

    @Test
    void submitTurnstileFailureReturnsBadRequest() {
        when(service.submit(anyString(), anyInt(), anyInt(), anyInt(), anyString(), anyString()))
                .thenReturn(Mono.error(new IllegalArgumentException("Turnstile action mismatch")));
        client.post().uri("/iq-matrix/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validBody().toString())
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void topUsesDefaultLimitAndReturnsData() {
        when(service.top(20)).thenReturn(Mono.just(new IqMatrixTopResponse(List.of(), 0)));
        client.get().uri("/iq-matrix/leaderboard")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.total").isEqualTo(0);
        verify(service).top(20);
    }

    @Test
    void topRejectsNonNumericLimit() {
        client.get().uri("/iq-matrix/leaderboard?limit=abc")
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.message").isEqualTo("limit must be an integer");
    }

    private ObjectNode validBody() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "玩家一");
        body.put("matrixAccuracy", 78);
        body.put("avgReactionMs", 9000);
        body.put("wmAccuracy", 85);
        body.put("cfTurnstileToken", "token");
        return body;
    }

    private void postExpectBadRequest(ObjectNode body, String message) {
        client.post().uri("/iq-matrix/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.message").isEqualTo(message);
    }
}
