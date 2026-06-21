package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.WealthButtonLeaderboardChallengeResponse;
import run.runnable.numfeelservice.model.GameplayEntities.WealthButtonLeaderboardEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import org.springframework.r2dbc.core.DatabaseClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WealthButtonServiceTest {

    @Mock
    private R2dbcEntityTemplate template;
    @Mock
    private DatabaseClient databaseClient;

    private WealthButtonService service;

    @BeforeEach
    void setUp() {
        service = new WealthButtonService(template, databaseClient);
    }

    @Test
    void sha256ShouldProduceCorrectHash() {
        assertEquals(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                WealthButtonService.sha256(""));
    }

    @Test
    void meetsPoWDifficultyShouldReturnExpectedResult() {
        assertTrue(WealthButtonService.meetsPoWDifficulty("0000abcdef123456"));
        assertFalse(WealthButtonService.meetsPoWDifficulty("0001abcdef123456"));
        assertFalse(WealthButtonService.meetsPoWDifficulty(null));
    }

    @Test
    void buildChallengePowPayloadShouldMatchExpectedFormat() {
        String payload = WealthButtonService.buildChallengePowPayload("cid", "alice", 100000, "WWLL");
        assertEquals("cid|alice|100000|WWLL", payload);
    }

    @Test
    void createLeaderboardChallengeShouldReturnChallengeMetadata() {
        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);
        assertNotNull(challenge.challengeId());
        assertEquals(WealthButtonService.POW_DIFFICULTY, challenge.difficulty());
        assertTrue(challenge.expiresAt() > System.currentTimeMillis());
    }

    @Test
    void consumeAndValidateChallengeShouldAcceptValidProof() {
        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);

        String payload = WealthButtonService.buildChallengePowPayload(
                challenge.challengeId(), "testuser", 100000, "WWLL");
        String[] proof = bruteForcePow(payload);

        String result = service.consumeAndValidateChallenge(
                challenge.challengeId(), "testuser", 100000, "WWLL", proof[0], proof[1]);
        assertNull(result);
    }

    @Test
    void consumeAndValidateChallengeShouldRejectReusedChallenge() {
        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);

        String payload = WealthButtonService.buildChallengePowPayload(
                challenge.challengeId(), "testuser", 100000, "WWLL");
        String[] proof = bruteForcePow(payload);

        assertNull(service.consumeAndValidateChallenge(
                challenge.challengeId(), "testuser", 100000, "WWLL", proof[0], proof[1]));
        assertEquals("Challenge expired or already used", service.consumeAndValidateChallenge(
                challenge.challengeId(), "testuser", 100000, "WWLL", proof[0], proof[1]));
    }

    @Test
    void consumeAndValidateChallengeShouldRejectUsedPowHash() throws Exception {
        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);

        String payload = WealthButtonService.buildChallengePowPayload(
                challenge.challengeId(), "testuser", 100000, "WWLL");
        String[] proof = bruteForcePow(payload);

        var field = WealthButtonService.class.getDeclaredField("usedPowHashes");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        Cache<String, Boolean> cache = (Cache<String, Boolean>) field.get(service);
        cache.put(proof[0], Boolean.TRUE);

        assertEquals("PoW already used", service.consumeAndValidateChallenge(
                challenge.challengeId(), "testuser", 100000, "WWLL", proof[0], proof[1]));
    }

    @Test
    void replayGameShouldRecomputeExpectedValues() {
        WealthButtonService.GameReplayResult result = service.replayGame(100000, "WL");
        assertEquals(2, result.pressCount());
        assertEquals(1, result.winCount());
        assertEquals(89994.5D, result.finalWealth(), 0.0001D);
        assertEquals(-10.0055D, result.returnRate(), 0.0001D);
    }

    @Test
    void replayGameShouldRejectContinuationAfterBankruptcy() {
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.replayGame(3, "LW"));
        assertEquals("roundHistory continues after bankruptcy", error.getMessage());
    }

    @Test
    void replayGameShouldRejectInvalidChar() {
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.replayGame(100000, "WXL"));
        assertEquals("roundHistory contains invalid char", error.getMessage());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitLeaderboardV2ShouldPersistServerRecomputedValues() {
        mockInsertSuccess();
        WealthButtonLeaderboardEntry persisted = mkEntry(
                "Alice", 89994.5D, -10.0055D, 2, 1, 100000, "WL", 1000L);
        mockSelectAllLeaderboard(List.of(persisted));

        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);
        String payload = WealthButtonService.buildChallengePowPayload(
                challenge.challengeId(), "Alice", 100000, "WL");
        String[] proof = bruteForcePow(payload);

        StepVerifier.create(service.submitLeaderboardV2("Alice", 100000, "WL",
                        challenge.challengeId(), proof[0], proof[1]))
                .assertNext(resp -> {
                    assertEquals(1, resp.wealthRank());
                    assertEquals(1, resp.returnRank());
                    assertEquals(1, resp.total());
                })
                .verifyComplete();

        verifyInsertValues(100000, "WL", 2, 1, 89994.5D, -10.0055D);
    }

    @Test
    void submitLeaderboardV2ShouldRejectHistoryAfterBankruptcy() {
        WealthButtonLeaderboardChallengeResponse challenge = service.createLeaderboardChallenge().block();
        assertNotNull(challenge);
        String payload = WealthButtonService.buildChallengePowPayload(
                challenge.challengeId(), "Alice", 3, "LW");
        String[] proof = bruteForcePow(payload);

        StepVerifier.create(service.submitLeaderboardV2("Alice", 3, "LW",
                        challenge.challengeId(), proof[0], proof[1]))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "roundHistory continues after bankruptcy".equals(err.getMessage()))
                .verify();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getLeaderboardShouldReturnDeduplicatedByUsername() {
        List<WealthButtonLeaderboardEntry> rows = List.of(
                mkEntry("Alice", 1000000.0, 900.0, 20, 12, 100000, "WWLWL", 1000L),
                mkEntry("Alice", 500000.0, 400.0, 15, 8, 100000, "WLWLL", 2000L),
                mkEntry("Bob", 2000000.0, 1900.0, 30, 18, 100000, "WWWLL", 3000L)
        );
        mockSelectAllLeaderboard(rows);

        StepVerifier.create(service.getLeaderboard(10))
                .assertNext(resp -> {
                    assertEquals(2, resp.byWealth().size());
                    assertEquals(2, resp.byReturn().size());
                    assertEquals("Bob", resp.byWealth().get(0).username());
                    assertEquals("Alice", resp.byWealth().get(1).username());
                    assertEquals(1000000.0, resp.byWealth().get(1).finalWealth());
                    assertEquals("Bob", resp.byReturn().get(0).username());
                    assertEquals("Alice", resp.byReturn().get(1).username());
                    assertEquals(900.0, resp.byReturn().get(1).returnRate());
                    assertEquals(2, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getLeaderboardShouldRespectLimit() {
        List<WealthButtonLeaderboardEntry> rows = List.of(
                mkEntry("A", 100.0, 0.0, 1, 0, 100000, "L", 1000L),
                mkEntry("B", 200.0, 100.0, 2, 1, 100000, "WL", 2000L),
                mkEntry("C", 300.0, 200.0, 3, 2, 100000, "WWL", 3000L)
        );
        mockSelectAllLeaderboard(rows);

        StepVerifier.create(service.getLeaderboard(2))
                .assertNext(resp -> {
                    assertEquals(2, resp.byWealth().size());
                    assertEquals(2, resp.byReturn().size());
                    assertEquals("C", resp.byWealth().get(0).username());
                    assertEquals("B", resp.byWealth().get(1).username());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getLeaderboardShouldReturnEmptyWhenNoData() {
        mockSelectAllLeaderboard(List.of());

        StepVerifier.create(service.getLeaderboard(10))
                .assertNext(resp -> {
                    assertTrue(resp.byWealth().isEmpty());
                    assertTrue(resp.byReturn().isEmpty());
                    assertEquals(0, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getLeaderboardShouldAssignCorrectRanks() {
        List<WealthButtonLeaderboardEntry> rows = List.of(
                mkEntry("A", 300.0, 200.0, 5, 3, 100000, "WWWLL", 1000L),
                mkEntry("B", 100.0, 0.0, 5, 2, 100000, "WWLLL", 2000L),
                mkEntry("C", 200.0, 100.0, 5, 3, 100000, "WWWLL", 3000L)
        );
        mockSelectAllLeaderboard(rows);

        StepVerifier.create(service.getLeaderboard(10))
                .assertNext(resp -> {
                    assertEquals(1, resp.byWealth().get(0).rank());
                    assertEquals(2, resp.byWealth().get(1).rank());
                    assertEquals(3, resp.byWealth().get(2).rank());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAllLeaderboard(List<WealthButtonLeaderboardEntry> rows) {
        ReactiveSelectOperation.ReactiveSelect<WealthButtonLeaderboardEntry> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(WealthButtonLeaderboardEntry.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<WealthButtonLeaderboardEntry> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(WealthButtonLeaderboardEntry.class)).thenReturn(insertMock);
        when(insertMock.using(any(WealthButtonLeaderboardEntry.class)))
                .thenAnswer(invocation -> Mono.just(invocation.getArgument(0)));
    }

    @SuppressWarnings("unchecked")
    private void verifyInsertValues(int initialWealth, String roundHistory, int pressCount,
                                    int winCount, double finalWealth, double returnRate) {
        ReactiveInsertOperation.ReactiveInsert<WealthButtonLeaderboardEntry> insertMock =
                (ReactiveInsertOperation.ReactiveInsert<WealthButtonLeaderboardEntry>)
                        template.insert(WealthButtonLeaderboardEntry.class);
        @SuppressWarnings("unchecked")
        var captor = org.mockito.ArgumentCaptor.forClass(WealthButtonLeaderboardEntry.class);
        verify(insertMock).using(captor.capture());
        WealthButtonLeaderboardEntry entity = captor.getValue();
        assertEquals(initialWealth, entity.initialWealth());
        assertEquals(roundHistory, entity.roundHistory());
        assertEquals(pressCount, entity.pressCount());
        assertEquals(winCount, entity.winCount());
        assertEquals(finalWealth, entity.finalWealth(), 0.0001D);
        assertEquals(returnRate, entity.returnRate(), 0.0001D);
    }

    private static WealthButtonLeaderboardEntry mkEntry(String username, double finalWealth,
                                                        double returnRate, int pressCount,
                                                        int winCount, int initialWealth,
                                                        String roundHistory, long createdAt) {
        return new WealthButtonLeaderboardEntry(
                null, username, finalWealth, returnRate, pressCount, winCount,
                initialWealth, roundHistory, "0000abc", "123", createdAt);
    }

    private static String[] bruteForcePow(String payload) {
        for (int i = 0; i < 2_000_000; i++) {
            String nonce = String.valueOf(i);
            String hash = WealthButtonService.sha256(payload + nonce);
            if (hash.startsWith("0000")) {
                return new String[]{hash, nonce};
            }
        }
        fail("Should find a valid nonce within 2M attempts");
        return new String[0];
    }
}
