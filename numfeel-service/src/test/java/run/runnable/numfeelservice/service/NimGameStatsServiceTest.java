package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.NimGameStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.NimGameStat;
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
class NimGameStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private NimGameStatsService service;

    @BeforeEach
    void setUp() {
        service = new NimGameStatsService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnStats() {
        mockInsertSuccess();
        List<NimGameStat> rows = List.of(
                mkStat("win", "easy", 8, "3-4-5"),
                mkStat("lose", "hard", 12, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("win", "normal", 10, "1-3-5-7"))
                .assertNext(resp -> {
                    assertEquals(2, resp.total());
                    assertEquals(1, resp.playerWins());
                    assertEquals(1, resp.aiWins());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnAggregatedData() {
        List<NimGameStat> rows = List.of(
                mkStat("win", "easy", 5, "3-4-5"),
                mkStat("win", "normal", 10, "1-3-5-7"),
                mkStat("lose", "hard", 15, "1-3-5-7"),
                mkStat("lose", "hard", 20, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(4, resp.total());
                    assertEquals(2, resp.playerWins());
                    assertEquals(2, resp.aiWins());
                    assertEquals(50.0, resp.aiWinRate());
                    assertEquals(100.0, resp.aiWinRateHard());
                    assertEquals(1, resp.gamesEasy());
                    assertEquals(1, resp.gamesNormal());
                    assertEquals(2, resp.gamesHard());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnZeroStatsWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.playerWins());
                    assertEquals(0, resp.aiWins());
                    assertEquals(0.0, resp.aiWinRate());
                    assertEquals(0.0, resp.aiWinRateHard());
                    assertEquals(0, resp.gamesEasy());
                    assertEquals(0, resp.gamesNormal());
                    assertEquals(0, resp.gamesHard());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldHandleAllPlayerWins() {
        List<NimGameStat> rows = List.of(
                mkStat("win", "easy", 5, "3-4-5"),
                mkStat("win", "normal", 10, "1-3-5-7"),
                mkStat("win", "hard", 15, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(3, resp.total());
                    assertEquals(3, resp.playerWins());
                    assertEquals(0, resp.aiWins());
                    assertEquals(0.0, resp.aiWinRate());
                    assertEquals(0.0, resp.aiWinRateHard());
                    assertEquals(1, resp.gamesEasy());
                    assertEquals(1, resp.gamesNormal());
                    assertEquals(1, resp.gamesHard());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldComputeAiWinRateHardWithOnlyHardGames() {
        List<NimGameStat> rows = List.of(
                mkStat("win", "hard", 10, "1-3-5-7"),
                mkStat("lose", "hard", 12, "1-3-5-7"),
                mkStat("lose", "hard", 15, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(3, resp.total());
                    assertEquals(1, resp.playerWins());
                    assertEquals(2, resp.aiWins());
                    assertEquals(66.7, resp.aiWinRate());
                    assertEquals(66.7, resp.aiWinRateHard());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnZeroAiWinRateHardWhenNoHardGames() {
        List<NimGameStat> rows = List.of(
                mkStat("win", "easy", 5, "3-4-5"),
                mkStat("lose", "normal", 10, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(2, resp.total());
                    assertEquals(50.0, resp.aiWinRate());
                    assertEquals(0.0, resp.aiWinRateHard());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldComputeDifficultyDistribution() {
        List<NimGameStat> rows = List.of(
                mkStat("win", "easy", 5, "3-4-5"),
                mkStat("win", "easy", 6, "3-4-5"),
                mkStat("lose", "normal", 10, "1-3-5-7"),
                mkStat("lose", "normal", 11, "1-3-5-7"),
                mkStat("win", "normal", 12, "1-3-5-7"),
                mkStat("lose", "hard", 15, "1-3-5-7"),
                mkStat("lose", "hard", 16, "1-3-5-7"),
                mkStat("lose", "hard", 17, "1-3-5-7"),
                mkStat("win", "hard", 18, "1-3-5-7"),
                mkStat("lose", "hard", 19, "1-3-5-7")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(2, resp.gamesEasy());
                    assertEquals(3, resp.gamesNormal());
                    assertEquals(5, resp.gamesHard());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<NimGameStat> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(NimGameStat.class)).thenReturn(insertMock);
        when(insertMock.using(any(NimGameStat.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<NimGameStat> rows) {
        ReactiveSelectOperation.ReactiveSelect<NimGameStat> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(NimGameStat.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static NimGameStat mkStat(String result, String difficulty, int rounds, String preset) {
        return new NimGameStat(null, result, difficulty, rounds, preset, System.currentTimeMillis());
    }
}
