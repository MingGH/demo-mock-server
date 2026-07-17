package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.model.GameplayEntities.IqMatrixEntry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IqMatrixLeaderboardServiceTest {

    @Mock
    private R2dbcEntityTemplate template;
    @Mock
    private DatabaseClient db;
    @Mock
    private TurnstileVerifier turnstileVerifier;

    private IqMatrixLeaderboardService service;

    @BeforeEach
    void setUp() {
        service = new IqMatrixLeaderboardService(template, db, turnstileVerifier);
    }

    @Test
    void computeOverallScoreBestValuesReturnsOneHundred() {
        assertEquals(100, service.computeOverallScore(100, 1_000, 100));
    }

    @Test
    void computeOverallScoreWorstValuesReturnsZero() {
        assertEquals(0, service.computeOverallScore(0, 30_000, 0));
    }

    @Test
    void computeOverallScoreMatchesFrontendFormula() {
        assertEquals(79, service.computeOverallScore(78, 9_000, 85));
    }

    @Test
    void speedCannotRewardZeroAccuracyGuessing() {
        int veryFast = service.computeOverallScore(0, 100, 0);
        int timedOut = service.computeOverallScore(0, 30_000, 0);
        assertEquals(timedOut, veryFast);
        assertEquals(0, veryFast);
    }

    @Test
    void fasterCorrectAnswersIncreaseScore() {
        int fast = service.computeOverallScore(78, 5_000, 80);
        int slow = service.computeOverallScore(78, 20_000, 80);
        assertTrue(fast > slow);
    }

    @Test
    void submitVerifiesExpectedTurnstileActionBeforeDatabaseAccess() {
        when(turnstileVerifier.verify("bad", "203.0.113.4",
                IqMatrixLeaderboardService.TURNSTILE_ACTION,
                IqMatrixLeaderboardService.TURNSTILE_HOSTNAME))
                .thenReturn(Mono.error(new IllegalArgumentException("Turnstile action mismatch")));

        StepVerifier.create(service.submit("玩家", 78, 9_000, 85, "bad", "203.0.113.4"))
                .expectErrorMatches(error -> error instanceof IllegalArgumentException
                        && error.getMessage().contains("action mismatch"))
                .verify();

        verify(turnstileVerifier).verify("bad", "203.0.113.4",
                "iq-matrix-submit", "numfeel.996.ninja");
        verify(template, never()).insert(IqMatrixEntry.class);
        verify(db, never()).sql(any(String.class));
    }
}
