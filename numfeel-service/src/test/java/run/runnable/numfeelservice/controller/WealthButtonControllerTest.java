package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardChallengeResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardItem;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonStatsResponse;
import run.runnable.numfeelservice.service.WealthButtonService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WealthButtonControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private WealthButtonService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(WealthButtonService.class);
        client = WebTestClient.bindToController(new WealthButtonController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // ── POST /wealth-button/incr ──────────────────────────────────────

    @Test
    void incr_validField_returnsOk() {
        when(mockService.incrementStat("players")).thenReturn(Mono.empty());

        client.post().uri("/wealth-button/incr?field=players")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200);
    }

    @Test
    void incr_invalidField_returns400() {
        client.post().uri("/wealth-button/incr?field=invalid")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void incr_bankrupt_returnsOk() {
        when(mockService.incrementStat("bankrupt")).thenReturn(Mono.empty());

        client.post().uri("/wealth-button/incr?field=bankrupt")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void incr_billionaire_returnsOk() {
        when(mockService.incrementStat("billionaire")).thenReturn(Mono.empty());

        client.post().uri("/wealth-button/incr?field=billionaire")
                .exchange()
                .expectStatus().isOk();
    }

    // ── GET /wealth-button/stats ──────────────────────────────────────

    @Test
    void stats_returnsData() {
        when(mockService.getStats())
                .thenReturn(Mono.just(new WealthButtonStatsResponse(100, 50, 3)));

        client.get().uri("/wealth-button/stats")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.players").isEqualTo(100)
                .jsonPath("$.data.bankrupt").isEqualTo(50)
                .jsonPath("$.data.billionaire").isEqualTo(3);
    }

    // ── POST /wealth-button/leaderboard ───────────────────────────────

    @Test
    void leaderboard_submit_validBody_returnsOk() {
        when(mockService.submitLeaderboard(anyString(), anyDouble(), anyDouble(),
                anyInt(), anyInt(), anyInt(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn(Mono.just(new WealthButtonLeaderboardSubmitResponse(1, 2, 10)));

        client.post().uri("/wealth-button/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validSubmitBody().toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.wealthRank").isEqualTo(1)
                .jsonPath("$.data.returnRank").isEqualTo(2)
                .jsonPath("$.data.total").isEqualTo(10);
    }

    @Test
    void leaderboard_submit_nullBody_returns400() {
        client.post().uri("/wealth-button/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submit_missingUsername_returns400() {
        ObjectNode body = validSubmitBody();
        body.remove("username");

        client.post().uri("/wealth-button/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submit_emptyUsername_returns400() {
        ObjectNode body = validSubmitBody();
        body.put("username", "  ");

        client.post().uri("/wealth-button/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_challenge_returnsData() {
        when(mockService.createLeaderboardChallenge())
                .thenReturn(Mono.just(new WealthButtonLeaderboardChallengeResponse("cid-1", 123456789L, 4)));

        client.get().uri("/wealth-button/leaderboard/challenge")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.challengeId").isEqualTo("cid-1")
                .jsonPath("$.data.expiresAt").isEqualTo(123456789)
                .jsonPath("$.data.difficulty").isEqualTo(4);
    }

    @Test
    void leaderboard_submitV2_validBody_returnsOk() {
        when(mockService.submitLeaderboardV2(anyString(), anyInt(), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(Mono.just(new WealthButtonLeaderboardSubmitResponse(1, 2, 10)));

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validSubmitV2Body().toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.wealthRank").isEqualTo(1)
                .jsonPath("$.data.returnRank").isEqualTo(2)
                .jsonPath("$.data.total").isEqualTo(10);
    }

    @Test
    void leaderboard_submitV2_emptyUsername_returns400() {
        ObjectNode body = validSubmitV2Body();
        body.put("username", "  ");

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submitV2_usernameTooLong_returns400() {
        ObjectNode body = validSubmitV2Body();
        body.put("username", "a".repeat(51));

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submitV2_invalidInitialWealth_returns400() {
        ObjectNode body = validSubmitV2Body();
        body.put("initialWealth", 0);

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submitV2_missingChallengeId_returns400() {
        ObjectNode body = validSubmitV2Body();
        body.remove("challengeId");

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submitV2_missingPowHash_returns400() {
        ObjectNode body = validSubmitV2Body();
        body.remove("powHash");

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void leaderboard_submitV2_serviceRejectsPoW_returns400() {
        when(mockService.submitLeaderboardV2(anyString(), anyInt(), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(Mono.error(new IllegalArgumentException("PoW hash mismatch")));

        client.post().uri("/wealth-button/leaderboard/submit-v2")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validSubmitV2Body().toString())
                .exchange()
                .expectStatus().isEqualTo(400)
                .expectBody()
                .jsonPath("$.message").isEqualTo("PoW hash mismatch");
    }

    @Test
    void leaderboard_submit_serviceRejectsPoW_returns400() {
        when(mockService.submitLeaderboard(anyString(), anyDouble(), anyDouble(),
                anyInt(), anyInt(), anyInt(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn(Mono.error(new IllegalArgumentException("PoW hash mismatch")));

        client.post().uri("/wealth-button/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validSubmitBody().toString())
                .exchange()
                .expectStatus().isEqualTo(400)
                .expectBody()
                .jsonPath("$.message").isEqualTo("PoW hash mismatch");
    }

    // ── GET /wealth-button/leaderboard ────────────────────────────────

    @Test
    void leaderboard_get_returnsData() {
        WealthButtonLeaderboardItem item1 = new WealthButtonLeaderboardItem(
                1, "Alice", 1000000.0, 900.0, 20, 12, 100000, "WWLWL", 1000L);
        WealthButtonLeaderboardItem item2 = new WealthButtonLeaderboardItem(
                2, "Bob", 500000.0, 400.0, 15, 8, 100000, "WLWLL", 2000L);

        when(mockService.getLeaderboard(anyInt()))
                .thenReturn(Mono.just(new WealthButtonLeaderboardResponse(
                        List.of(item1, item2), List.of(item1, item2), 2)));

        client.get().uri("/wealth-button/leaderboard?limit=10")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.byWealth[0].username").isEqualTo("Alice")
                .jsonPath("$.data.byWealth[0].rank").isEqualTo(1)
                .jsonPath("$.data.byReturn[1].username").isEqualTo("Bob")
                .jsonPath("$.data.total").isEqualTo(2);
    }

    @Test
    void leaderboard_get_defaultLimit() {
        when(mockService.getLeaderboard(10))
                .thenReturn(Mono.just(new WealthButtonLeaderboardResponse(List.of(), List.of(), 0)));

        client.get().uri("/wealth-button/leaderboard")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.total").isEqualTo(0);
    }

    // ── 辅助方法 ──────────────────────────────────────────────────────

    private ObjectNode validSubmitBody() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("username", "TestUser");
        body.put("finalWealth", 500000.0);
        body.put("returnRate", 400.0);
        body.put("pressCount", 10);
        body.put("winCount", 6);
        body.put("initialWealth", 100000);
        body.put("roundHistory", "WWWWWWLLLL");
        body.put("powHash", "0000abcdef1234567890");
        body.put("powNonce", "42");
        body.put("timestamp", System.currentTimeMillis());
        return body;
    }

    private ObjectNode validSubmitV2Body() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("username", "TestUser");
        body.put("initialWealth", 100000);
        body.put("roundHistory", "WWWWWWLLLL");
        body.put("challengeId", "cid-1");
        body.put("powHash", "0000abcdef1234567890");
        body.put("powNonce", "42");
        return body;
    }
}
