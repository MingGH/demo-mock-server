package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenBetsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private TurnstileVerifier turnstileVerifier;

    private TenBetsService service;

    @BeforeEach
    void setUp() {
        service = new TenBetsService(template, turnstileVerifier);
    }

    // ── 重放：规则与前端 ten-bets-logic.js 一致 ──

    @Test
    void replay_winAtRound1_allIn() {
        var r = TenBetsService.replay(new double[]{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}, 1);
        assertTrue(r.won());
        assertEquals(1, r.rounds());
        assertEquals(1000D, r.finalCapital());
    }

    @Test
    void replay_loseAllIn_round1_bust() {
        var r = TenBetsService.replay(new double[]{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}, 6);
        assertFalse(r.won());
        assertEquals(1, r.rounds());
        assertEquals(0D, r.finalCapital());
    }

    @Test
    void replay_fixed10_neverBustsAndAlwaysWins() {
        double[] bets = new double[10];
        java.util.Arrays.fill(bets, 10D);
        for (int winner = 1; winner <= 10; winner++) {
            var r = TenBetsService.replay(bets, winner);
            assertTrue(r.won(), "中签位 " + winner + " 必以中签收尾");
            assertEquals(200D - 10D * winner, r.finalCapital(), 1e-9);
        }
    }

    @Test
    void replay_equalizePlan_flattensAllOutcomes() {
        // 均注流：b1 = 100/(9*((10/9)^10-1))，每注 ×10/9
        double r1 = 10D / 9D;
        double b1 = 100D / (9D * (Math.pow(r1, 10) - 1D));
        double[] bets = new double[10];
        double used = 0D;
        for (int i = 0; i < 10; i++) {
            bets[i] = (i == 9) ? (100D - used) : b1 * Math.pow(r1, i);
            used += bets[i];
        }
        double min = Double.MAX_VALUE, max = -Double.MAX_VALUE;
        for (int winner = 1; winner <= 10; winner++) {
            var r = TenBetsService.replay(bets, winner);
            assertTrue(r.won());
            min = Math.min(min, r.finalCapital());
            max = Math.max(max, r.finalCapital());
        }
        assertEquals(0D, max - min, 0.01, "均注流所有结局拉平");
        assertEquals(153.53D, min, 0.01, "保底 = 期望 ≈ 153.53");
    }

    @Test
    void replay_bustAtRound2_whenCapitalBelowBet() {
        // 押 60：第 1 注剩 40，第 2 注押 min(60,40)=40，未中 → 归零
        double[] bets = new double[10];
        java.util.Arrays.fill(bets, 60D);
        var r = TenBetsService.replay(bets, 3);
        assertFalse(r.won());
        assertEquals(2, r.rounds());
        assertEquals(0D, r.finalCapital());
    }

    // ── bets 解析 ──

    @Test
    void parseBets_valid() {
        double[] bets = TenBetsService.parseBets("5.95, 6.61,7.34");
        assertEquals(10, bets.length);
        assertEquals(5.95, bets[0]);
        assertEquals(6.61, bets[1]);
        assertEquals(7.34, bets[2]);
        assertEquals(0D, bets[9]);
    }

    @Test
    void parseBets_tooManyEntries_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> TenBetsService.parseBets("1,1,1,1,1,1,1,1,1,1,1"));
    }

    @Test
    void parseBets_invalidNumber_throws() {
        assertThrows(IllegalArgumentException.class, () -> TenBetsService.parseBets("10,abc"));
        assertThrows(IllegalArgumentException.class, () -> TenBetsService.parseBets("10,-5"));
        assertThrows(IllegalArgumentException.class, () -> TenBetsService.parseBets("10,0"));
        assertThrows(IllegalArgumentException.class, () -> TenBetsService.parseBets(""));
    }

    // ── PoW 与 challenge 消费 ──

    @Test
    void consumeChallenge_fullFlow() {
        var challenge = service.createChallenge().block();
        assertNotNull(challenge);
        String bets = "10,10,10,10,10,10,10,10,10,10";
        String payload = TenBetsService.buildChallengePowPayload(
                challenge.challengeId(), "tester", "uniform", bets);

        String badNonce = "1";
        String hashWrong = TenBetsService.sha256(payload + badNonce);
        // 未达难度的 nonce 直接拒绝
        if (TenBetsService.meetsPoWDifficulty(hashWrong)) {
            badNonce = "999999";
            hashWrong = TenBetsService.sha256(payload + badNonce);
        }
        final String fNonce = badNonce;
        final String fHash = hashWrong;
        IllegalArgumentException err = assertThrows(IllegalArgumentException.class,
                () -> service.consumeChallenge(challenge.challengeId(), "tester", "uniform", bets, fHash, fNonce));
        assertTrue(err.getMessage().contains("PoW"));

        // 计算满足难度的 nonce（错误尝试已烧掉上面的 challenge，换新的）
        var challenge2 = service.createChallenge().block();
        assertNotNull(challenge2);
        String payload2 = TenBetsService.buildChallengePowPayload(
                challenge2.challengeId(), "tester", "uniform", bets);
        var good = mine(payload2);
        int winnerPos = service.consumeChallenge(
                challenge2.challengeId(), "tester", "uniform", bets, good.hash(), good.nonce());
        assertTrue(winnerPos >= 1 && winnerPos <= 10, "返回保密的中签位");

        // 二次消费同一 challenge → 已失效
        assertThrows(IllegalArgumentException.class,
                () -> service.consumeChallenge(challenge2.challengeId(), "tester", "uniform", bets, good.hash(), good.nonce()));
    }

    @Test
    void consumeChallenge_expiredOrUnknown_throws() {
        IllegalArgumentException err = assertThrows(IllegalArgumentException.class,
                () -> service.consumeChallenge("no-such-id", "tester", "uniform", "10", "0abc", "1"));
        assertTrue(err.getMessage().contains("Challenge"));
    }

    @Test
    void powHashReplayBlocked() {
        var challenge = service.createChallenge().block();
        String bets = "10,10,10";
        String payload = TenBetsService.buildChallengePowPayload(challenge.challengeId(), "tester", "uniform", bets);
        var mined = mine(payload);
        service.consumeChallenge(challenge.challengeId(), "tester", "uniform", bets, mined.hash(), mined.nonce());

        var challenge2 = service.createChallenge().block();
        String payload2 = TenBetsService.buildChallengePowPayload(challenge2.challengeId(), "tester", "uniform", bets);
        // 用旧 pow_hash 提交新 challenge：PoW already used（缓存 5 分钟内有效）
        IllegalArgumentException err = assertThrows(IllegalArgumentException.class,
                () -> service.consumeChallenge(challenge2.challengeId(), "tester", "uniform", bets, mined.hash(), mined.nonce()));
        assertTrue(err.getMessage().contains("already used"));
    }

    // ── submit 全链路（mock Turnstile 与存储层） ──

    @Test
    void submit_cooldownBetweenSubmits() {
        when(turnstileVerifier.verify(anyString(), anyString())).thenReturn(Mono.empty());
        var c1 = service.createChallenge().block();
        assertNotNull(c1);
        String bets = "10,10,10,10,10,10,10,10,10,10";
        String p1 = TenBetsService.buildChallengePowPayload(c1.challengeId(), "u1", "uniform", bets);
        var m1 = mine(p1);
        // 第一次提交：insert 未 mock → 链路报错，但冷却时间在消费 challenge 后已写入
        assertThrows(Exception.class, () -> service.submit("u1", "uniform", bets, c1.challengeId(),
                m1.hash(), m1.nonce(), "tok", "1.2.3.4").block());
        // 第二次提交（新 challenge + 新 PoW）：撞 10 秒冷却
        var c2 = service.createChallenge().block();
        String p2 = TenBetsService.buildChallengePowPayload(c2.challengeId(), "u1", "uniform", bets);
        var m2 = mine(p2);
        StepVerifier.create(service.submit("u1", "uniform", bets, c2.challengeId(),
                        m2.hash(), m2.nonce(), "tok", "1.2.3.4"))
                .expectErrorSatisfies(e -> assertTrue(e.getMessage().contains("too frequent")))
                .verify();
    }

    private record Mined(String hash, String nonce) {
    }

    private Mined mine(String payload) {
        int nonce = 0;
        while (true) {
            String hash = TenBetsService.sha256(payload + nonce);
            if (TenBetsService.meetsPoWDifficulty(hash)) {
                return new Mined(hash, String.valueOf(nonce));
            }
            nonce++;
        }
    }
}
