package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingLeaderboardRecord;
import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingResult;
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

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IowaGamblingServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient databaseClient;

    @Mock
    private TurnstileVerifier turnstileVerifier;

    private IowaGamblingService service;

    @BeforeEach
    void setUp() {
        service = new IowaGamblingService(template, databaseClient, turnstileVerifier);
    }

    private static IowaGamblingResult toResult(long id, int totalRounds, int finalMoney, int netScore,
                                               boolean bankrupt, String deckPicks, String blockScores) {
        return new IowaGamblingResult(id, "session-" + id, totalRounds, finalMoney, netScore,
                bankrupt, deckPicks, blockScores, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecord() {
        ReactiveInsertOperation.ReactiveInsert<IowaGamblingResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("s1", 100, 3000, 10, false,
                        "[25,25,25,25]", "[2,-4,6,10,8]"))
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.totalRounds() == 100
                        && e.finalMoney() == 3000
                        && e.netScore() == 10
                        && !e.bankrupt()
                        && "[25,25,25,25]".equals(e.deckPicks())
                        && "[2,-4,6,10,8]".equals(e.blockScores())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<IowaGamblingResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        StepVerifier.create(service.submit("s1", 100, 3000, 10, false,
                        "[25,25,25,25]", "[2,-4,6,10,8]"))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<IowaGamblingResult> rows = List.of(
                toResult(1L, 100, 2500, 6, false, "[20,20,30,30]", "[0,0,4,4,4]"),
                toResult(2L, 100, 1500, -2, false, "[30,30,20,20]", "[-4,-2,0,2,2]"),
                toResult(3L, 62, -800, -20, true, "[40,30,10,20]", "[-10,-10]")
        );

        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.totalSessions());
                    assertEquals(-5.3, resp.avgNetScore(), 0.01);
                    assertEquals(1066.7, resp.avgFinalMoney(), 0.1);
                    assertEquals(0.33, resp.bankruptRate(), 0.01);
                    assertEquals(4, resp.avgDeckPicks().size());
                    assertEquals(30.0, resp.avgDeckPicks().get(0), 0.01);
                    assertEquals(26.7, resp.avgDeckPicks().get(1), 0.1);
                    assertEquals(5, resp.avgBlockScores().size());
                    assertEquals(-4.7, resp.avgBlockScores().get(0), 0.01);
                    assertEquals(-4.0, resp.avgBlockScores().get(1), 0.01);
                    assertEquals(2.0, resp.avgBlockScores().get(2), 0.01);
                    assertEquals(3.0, resp.avgBlockScores().get(3), 0.01);
                    assertEquals(3.0, resp.avgBlockScores().get(4), 0.01);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalSessions());
                    assertEquals(0.0, resp.avgNetScore());
                    assertEquals(0.0, resp.avgFinalMoney());
                    assertEquals(0.0, resp.bankruptRate());
                    assertTrue(resp.avgDeckPicks().isEmpty());
                    assertTrue(resp.avgBlockScores().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyJsonArrays() {
        // deckPicks/blockScores 为合法但空的 JSON 数组（[]）不应导致越界异常
        List<IowaGamblingResult> rows = List.of(
                toResult(1L, 100, 2500, 6, false, "[]", "[]"),
                toResult(2L, 100, 1500, -2, false, "[]", "[]")
        );

        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.totalSessions());
                    assertEquals(0.0, resp.avgDeckPicks().get(0));
                    assertTrue(resp.avgBlockScores().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    void parseJsonArrayShouldHandleValidJson() {
        List<Integer> result = IowaGamblingService.parseJsonArray("[1,2,3,4]", 4);
        assertEquals(List.of(1, 2, 3, 4), result);
    }

    @Test
    void parseJsonArrayShouldHandleMalformedJson() {
        List<Integer> result = IowaGamblingService.parseJsonArray("not-json", 4);
        assertEquals(List.of(0, 0, 0, 0), result);
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldReturnEmptyWhenNoData() {
        ReactiveSelectOperation.ReactiveSelect<IowaGamblingLeaderboardRecord> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingLeaderboardRecord.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertTrue(resp.leaders().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldDedupeByUsernameAndRank() {
        List<IowaGamblingLeaderboardRecord> rows = List.of(
                new IowaGamblingLeaderboardRecord(1L, "alice", 30, 3000, false, 100,
                        "[10,20,40,30]", "h1", "n1", 1000L),
                new IowaGamblingLeaderboardRecord(2L, "alice", 20, 2500, false, 100,
                        "[20,20,30,30]", "h2", "n2", 2000L),
                new IowaGamblingLeaderboardRecord(3L, "bob", 40, 4000, false, 100,
                        "[5,5,45,45]", "h3", "n3", 1500L)
        );

        ReactiveSelectOperation.ReactiveSelect<IowaGamblingLeaderboardRecord> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingLeaderboardRecord.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(2, resp.total());
                    assertEquals(2, resp.leaders().size());
                    // 按净分数降序：bob(40) > alice(30)；alice 只保留最高的一条
                    assertEquals("bob", resp.leaders().get(0).username());
                    assertEquals(40, resp.leaders().get(0).netScore());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals("alice", resp.leaders().get(1).username());
                    assertEquals(30, resp.leaders().get(1).netScore());
                    assertEquals(2, resp.leaders().get(1).rank());
                })
                .verifyComplete();
    }

    @Test
    void createChallengeShouldReturnChallenge() {
        StepVerifier.create(service.createLeaderboardChallenge())
                .assertNext(resp -> {
                    assertNotNull(resp.challengeId());
                    assertFalse(resp.challengeId().isBlank());
                    assertEquals(IowaGamblingService.POW_DIFFICULTY, resp.difficulty());
                    assertTrue(resp.expiresAt() > System.currentTimeMillis());
                })
                .verifyComplete();
    }

    @Test
    void buildChallengePowPayloadShouldMatchFrontend() {
        String payload = IowaGamblingService.buildChallengePowPayload(
                "ch-1", "alice", 30, 3000, 100, "[10,20,40,30]");
        assertEquals("ch-1|alice|30|3000|100|[10,20,40,30]", payload);
    }

    @Test
    void meetsPoWDifficultyShouldValidatePrefix() {
        assertTrue(IowaGamblingService.meetsPoWDifficulty("0000abcdef"));
        assertFalse(IowaGamblingService.meetsPoWDifficulty("000abcdef"));
        assertFalse(IowaGamblingService.meetsPoWDifficulty("1000abcdef"));
        assertFalse(IowaGamblingService.meetsPoWDifficulty("abcd"));
        assertFalse(IowaGamblingService.meetsPoWDifficulty(null));
    }

    @Test
    void sha256ShouldProduceHexDigest() {
        // 空字符串的 SHA-256 已知摘要，用于验证实现正确
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                IowaGamblingService.sha256(""));
    }

    @Test
    void consumeAndValidateChallengeShouldAcceptValidPoW() {
        // 创建真实 challenge，构造满足难度的 nonce，校验应通过
        StepVerifier.create(service.createLeaderboardChallenge())
                .assertNext(resp -> {
                    String cid = resp.challengeId();
                    String payload = IowaGamblingService.buildChallengePowPayload(
                            cid, "alice", 30, 3000, 100, "[10,20,40,30]");
                    String h = null, n = null;
                    for (int nonce = 0; nonce < 1_000_000; nonce++) {
                        String hash = IowaGamblingService.sha256(payload + nonce);
                        if (IowaGamblingService.meetsPoWDifficulty(hash)) {
                            h = hash;
                            n = String.valueOf(nonce);
                            break;
                        }
                    }
                    assertNotNull(h, "should find a valid nonce");
                    assertNull(service.consumeAndValidateChallenge(
                            cid, "alice", 30, 3000, 100, "[10,20,40,30]", h, n));
                })
                .verifyComplete();
    }

    @Test
    void consumeAndValidateChallengeShouldRejectReusedChallenge() {
        // 未创建过的 challenge 应判定为过期/已用
        String error = service.consumeAndValidateChallenge(
                "never-created", "alice", 30, 3000, 100, "[10,20,40,30]", "0000abc", "1");
        assertNotNull(error);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitLeaderboardShouldPersistAndReturnRank() {
        // Turnstile 通过
        when(turnstileVerifier.verify(anyString(), anyString())).thenReturn(Mono.empty());

        ReactiveInsertOperation.ReactiveInsert<IowaGamblingLeaderboardRecord> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingLeaderboardRecord.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingLeaderboardRecord.class))).thenReturn(Mono.empty());

        List<IowaGamblingLeaderboardRecord> rows = List.of(
                new IowaGamblingLeaderboardRecord(1L, "alice", 30, 3000, false, 100,
                        "[10,20,40,30]", "h", "n", 1000L),
                // insert 后 selectAll 应包含刚提交的 bob 记录
                new IowaGamblingLeaderboardRecord(2L, "bob", 40, 4000, false, 100,
                        "[5,5,45,45]", "hb", "nb", 2000L)
        );
        ReactiveSelectOperation.ReactiveSelect<IowaGamblingLeaderboardRecord> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingLeaderboardRecord.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        // 先创建 challenge 并计算出合法 PoW
        String[] challengeInfo = new String[1];
        StepVerifier.create(service.createLeaderboardChallenge())
                .assertNext(resp -> {
                    String payload = IowaGamblingService.buildChallengePowPayload(
                            resp.challengeId(), "bob", 40, 4000, 100, "[5,5,45,45]");
                    String hash = null, nonce = null;
                    for (int n = 0; n < 1_000_000; n++) {
                        String h = IowaGamblingService.sha256(payload + n);
                        if (IowaGamblingService.meetsPoWDifficulty(h)) {
                            hash = h;
                            nonce = String.valueOf(n);
                            break;
                        }
                    }
                    challengeInfo[0] = resp.challengeId() + "|" + hash + "|" + nonce;
                })
                .verifyComplete();

        String[] parts = challengeInfo[0].split("\\|");
        StepVerifier.create(service.submitLeaderboard(
                        "bob", 40, 4000, false, 100, "[5,5,45,45]",
                        parts[0], parts[1], parts[2], "turnstile-token", "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(2, resp.total());
                })
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "bob".equals(e.username())
                        && e.netScore() == 40
                        && e.finalMoney() == 4000
                        && !e.bankrupt()));
    }

    @Test
    void submitLeaderboardShouldRejectCooldown() {
        // 第一次提交成功后（已在测试内设置 lastSubmitAt），第二次立即提交应被拒绝
        when(turnstileVerifier.verify(anyString(), anyString())).thenReturn(Mono.empty());

        ReactiveInsertOperation.ReactiveInsert<IowaGamblingLeaderboardRecord> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingLeaderboardRecord.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingLeaderboardRecord.class))).thenReturn(Mono.empty());
        ReactiveSelectOperation.ReactiveSelect<IowaGamblingLeaderboardRecord> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingLeaderboardRecord.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        String[] challengeInfo = new String[1];
        StepVerifier.create(service.createLeaderboardChallenge())
                .assertNext(resp -> {
                    String payload = IowaGamblingService.buildChallengePowPayload(
                            resp.challengeId(), "user", 10, 3000, 100, "[20,20,30,30]");
                    String hash = null, nonce = null;
                    for (int n = 0; n < 1_000_000; n++) {
                        String h = IowaGamblingService.sha256(payload + n);
                        if (IowaGamblingService.meetsPoWDifficulty(h)) {
                            hash = h;
                            nonce = String.valueOf(n);
                            break;
                        }
                    }
                    challengeInfo[0] = resp.challengeId() + "|" + hash + "|" + nonce;
                })
                .verifyComplete();
        String[] parts = challengeInfo[0].split("\\|");

        StepVerifier.create(service.submitLeaderboard(
                        "user", 10, 3000, false, 100, "[20,20,30,30]",
                        parts[0], parts[1], parts[2], "tok", "1.2.3.4"))
                .expectNextCount(1)
                .verifyComplete();

        // 第二次提交，冷却期内应被拒绝
        StepVerifier.create(service.submitLeaderboard(
                        "user", 20, 3500, false, 100, "[10,20,40,30]",
                        "x", "y", "z", "tok", "1.2.3.4"))
                .expectErrorMatches(e -> e instanceof IllegalArgumentException
                        && e.getMessage().contains("too frequent"))
                .verify();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitLeaderboardShouldRejectWhenTurnstileFails() {
        when(turnstileVerifier.verify(anyString(), anyString()))
                .thenReturn(Mono.error(new IllegalArgumentException("Turnstile verification failed")));

        StepVerifier.create(service.submitLeaderboard(
                        "alice", 30, 3000, false, 100, "[10,20,40,30]",
                        "ch", "0000abc", "1", "bad-token", "1.2.3.4"))
                .expectErrorMatches(e -> e instanceof IllegalArgumentException
                        && e.getMessage().contains("Turnstile"))
                .verify();

        // Turnstile 失败不应落库
        verify(template, never()).insert(IowaGamblingLeaderboardRecord.class);
    }
}
