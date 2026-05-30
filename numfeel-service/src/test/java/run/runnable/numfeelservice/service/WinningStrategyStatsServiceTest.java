package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.WinningStrategyStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.WinningStrategyStat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WinningStrategyStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private WinningStrategyStatsService service;

    @BeforeEach
    void setUp() {
        service = new WinningStrategyStatsService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnAggregatedStats() {
        mockInsertSuccess();
        List<WinningStrategyStat> rows = List.of(
                mkStat("bash", "win", "easy", 5),
                mkStat("bash", "lose", "hard", 8),
                mkStat("wythoff", "win", "normal", 6),
                mkStat("coin", "lose", "easy", 4)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("bash", "win", "hard", 10))
                .assertNext(resp -> {
                    assertEquals(4, resp.total());
                    assertEquals(2, resp.playerWins());
                    assertEquals(2, resp.aiWins());
                    assertEquals(50.0, resp.aiWinRate());
                    assertEquals(2, resp.gamesBash());
                    assertEquals(1, resp.gamesWythoff());
                    assertEquals(1, resp.gamesCoin());
                    assertEquals(1, resp.aiWinsHard());
                    assertEquals(1, resp.aiWinsBash());
                    assertEquals(0, resp.aiWinsWythoff());
                    assertEquals(1, resp.aiWinsCoin());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleEmptyTable() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        StepVerifier.create(service.submit("bash", "win", "easy", 5))
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.playerWins());
                    assertEquals(0, resp.aiWins());
                    assertEquals(0.0, resp.aiWinRate());
                    assertEquals(0, resp.gamesBash());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldAggregateAllGames() {
        List<WinningStrategyStat> rows = List.of(
                mkStat("bash", "win", "easy", 3),
                mkStat("bash", "lose", "hard", 7),
                mkStat("bash", "lose", "normal", 5),
                mkStat("wythoff", "win", "easy", 4),
                mkStat("wythoff", "lose", "hard", 6),
                mkStat("coin", "lose", "hard", 8),
                mkStat("coin", "lose", "easy", 2)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(7, resp.total());
                    assertEquals(2, resp.playerWins());
                    assertEquals(5, resp.aiWins());
                    assertEquals(71.4, resp.aiWinRate());
                    assertEquals(3, resp.gamesBash());
                    assertEquals(2, resp.gamesWythoff());
                    assertEquals(2, resp.gamesCoin());
                    assertEquals(3, resp.aiWinsHard());
                    assertEquals(2, resp.aiWinsBash());
                    assertEquals(1, resp.aiWinsWythoff());
                    assertEquals(2, resp.aiWinsCoin());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnZerosWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.playerWins());
                    assertEquals(0, resp.aiWins());
                    assertEquals(0.0, resp.aiWinRate());
                    assertEquals(0, resp.gamesBash());
                    assertEquals(0, resp.gamesWythoff());
                    assertEquals(0, resp.gamesCoin());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldCountAiWinsByDifficultyAndGame() {
        List<WinningStrategyStat> rows = List.of(
                mkStat("bash", "lose", "hard", 10),
                mkStat("bash", "lose", "easy", 5),
                mkStat("wythoff", "lose", "hard", 8),
                mkStat("coin", "lose", "hard", 6)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(4, resp.total());
                    assertEquals(0, resp.playerWins());
                    assertEquals(4, resp.aiWins());
                    assertEquals(100.0, resp.aiWinRate());
                    assertEquals(3, resp.aiWinsHard());
                    assertEquals(2, resp.aiWinsBash());
                    assertEquals(1, resp.aiWinsWythoff());
                    assertEquals(1, resp.aiWinsCoin());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldHandleAllPlayerWins() {
        List<WinningStrategyStat> rows = List.of(
                mkStat("bash", "win", "easy", 3),
                mkStat("wythoff", "win", "normal", 4),
                mkStat("coin", "win", "hard", 5)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(3, resp.total());
                    assertEquals(3, resp.playerWins());
                    assertEquals(0, resp.aiWins());
                    assertEquals(0.0, resp.aiWinRate());
                    assertEquals(0, resp.aiWinsHard());
                    assertEquals(0, resp.aiWinsBash());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldRoundAiWinRateToOneDecimal() {
        List<WinningStrategyStat> rows = List.of(
                mkStat("bash", "win", "easy", 5),
                mkStat("bash", "win", "easy", 5),
                mkStat("bash", "lose", "hard", 8)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(3, resp.total());
                    assertEquals(2, resp.playerWins());
                    assertEquals(1, resp.aiWins());
                    assertEquals(33.3, resp.aiWinRate());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<WinningStrategyStat> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(WinningStrategyStat.class)).thenReturn(insertMock);
        when(insertMock.using(any(WinningStrategyStat.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<WinningStrategyStat> rows) {
        ReactiveSelectOperation.ReactiveSelect<WinningStrategyStat> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(WinningStrategyStat.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static WinningStrategyStat mkStat(String game, String result, String difficulty, int rounds) {
        return new WinningStrategyStat(null, game, result, difficulty, rounds, System.currentTimeMillis());
    }
}
