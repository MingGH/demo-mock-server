package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsChallengeResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsItem;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsModeStat;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TenBetsSubmitResponse;
import run.runnable.numfeelservice.service.TenBetsService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenBetsControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TenBetsService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(TenBetsService.class);
        client = WebTestClient.bindToController(new TenBetsController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void getChallenge_returns200() {
        when(mockService.createChallenge())
                .thenReturn(Mono.just(new TenBetsChallengeResponse("cid", 123L, 4)));
        client.get().uri("/ten-bets/leaderboard/challenge")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.challengeId").isEqualTo("cid")
                .jsonPath("$.data.difficulty").isEqualTo(4);
    }

    @Test
    void submit_valid_returns200() {
        when(mockService.submit(anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString()))
                .thenReturn(Mono.just(new TenBetsSubmitResponse(1, 3, 7, 910D, 10, true)));

        ObjectNode body = MAPPER.createObjectNode();
        body.put("username", "tester");
        body.put("mode", "probe");
        body.put("bets", "1,1,1,1,1,1,1,1,1,91");
        body.put("challengeId", "cid");
        body.put("powHash", "0abc");
        body.put("powNonce", "1");
        body.put("cfTurnstileToken", "tok");

        client.post().uri("/ten-bets/leaderboard/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.rank").isEqualTo(1)
                .jsonPath("$.data.finalCapital").isEqualTo(910.0);
    }

    @Test
    void submit_nullBody_returns400() {
        client.post().uri("/ten-bets/leaderboard/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void submit_missingUsername_returns400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("mode", "probe");
        body.put("bets", "10");
        body.put("challengeId", "cid");
        body.put("powHash", "h");
        body.put("powNonce", "n");
        body.put("cfTurnstileToken", "t");
        client.post().uri("/ten-bets/leaderboard/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void submit_serviceValidationError_mapsTo400() {
        when(mockService.submit(anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString()))
                .thenReturn(Mono.error(new IllegalArgumentException("PoW hash mismatch")));
        ObjectNode body = MAPPER.createObjectNode();
        body.put("username", "tester");
        body.put("mode", "probe");
        body.put("bets", "10");
        body.put("challengeId", "cid");
        body.put("powHash", "h");
        body.put("powNonce", "n");
        body.put("cfTurnstileToken", "t");
        client.post().uri("/ten-bets/leaderboard/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void getLeaderboard_returns200() {
        var item = new TenBetsItem(1, "tester", "probe", 910D, 10, true, 10, 1L);
        var stat = new TenBetsModeStat("probe", 3, 3, 0, 500D, 910D, 8D);
        when(mockService.getLeaderboard(10))
                .thenReturn(Mono.just(new TenBetsLeaderboardResponse(List.of(item), List.of(stat), 3, 1)));
        client.get().uri("/ten-bets/leaderboard?limit=10")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.top[0].username").isEqualTo("tester")
                .jsonPath("$.data.byMode[0].avgCapital").isEqualTo(500.0)
                .jsonPath("$.data.totalGames").isEqualTo(3);
    }
}
