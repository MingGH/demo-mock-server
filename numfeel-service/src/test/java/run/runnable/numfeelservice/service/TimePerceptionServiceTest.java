package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.TimePerceptionSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.TimePerceptionResult;
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
class TimePerceptionServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private TimePerceptionService service;

    @BeforeEach
    void setUp() {
        service = new TimePerceptionService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankAndTotalSessions() {
        mockInsertSuccess();
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.12, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("Bob", 100, 0.15, 120, 130, 110, 80, "underestimator", "B"),
                mkResult("Charlie", 80, 0.18, 150, 160, 140, 100, "underestimator", "C")
        );
        mockSelectAll(rows);

        Mono<TimePerceptionSubmitResponse> result = service.submit(
                "Diana", 120, 0.14, 90, 95, 85, 80, "overestimator", "B");

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                    assertEquals(3, resp.totalSessions());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldRankFirstWithHighestScore() {
        mockInsertSuccess();
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 100, 0.12, 80, 100, 70, 90, "overestimator", "B"),
                mkResult("Bob", 80, 0.15, 120, 130, 110, 80, "underestimator", "C")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Diana", 200, 0.05, 50, 60, 40, 50, "overestimator", "A+"))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(2, resp.totalSessions());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldNotCountEqualScoresAsHigher() {
        mockInsertSuccess();
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.10, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("Bob", 100, 0.15, 120, 130, 110, 80, "underestimator", "B"),
                mkResult("Charlie", 100, 0.18, 150, 160, 140, 100, "underestimator", "C")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Diana", 100, 0.12, 90, 95, 85, 80, "overestimator", "B"))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                    assertEquals(3, resp.totalSessions());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleSingleEntry() {
        mockInsertSuccess();
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.10, 80, 100, 70, 90, "overestimator", "A")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Diana", 120, 0.12, 90, 95, 85, 80, "overestimator", "B"))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                    assertEquals(1, resp.totalSessions());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.12, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("Bob", 100, 0.08, 60, 70, 50, 60, "underestimator", "B"),
                mkResult("Charlie", 80, 0.06, 40, 50, 30, 40, "underestimator", "C")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    TimePerceptionGlobalStats global = resp.global();
                    assertEquals(3, global.totalSessions());
                    assertEquals(110.0, global.avgScore());
                    assertEquals(0.333, global.overRatio());
                    assertEquals(0.667, global.underRatio());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnGradeDistribution() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.12, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("Bob", 100, 0.15, 120, 130, 110, 80, "underestimator", "A"),
                mkResult("Charlie", 80, 0.18, 150, 160, 140, 100, "underestimator", "B")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2L, resp.gradeDist().get("A"));
                    assertEquals(1L, resp.gradeDist().get("B"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZerosWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.global().totalSessions());
                    assertEquals(0.0, resp.global().avgScore());
                    assertEquals(0.0, resp.global().overRatio());
                    assertEquals(0.0, resp.global().underRatio());
                    assertTrue(resp.gradeDist().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldReturnSortedByScoreDesc() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 80, 0.18, 150, 160, 140, 100, "underestimator", "C"),
                mkResult("Bob", 150, 0.10, 60, 70, 50, 60, "overestimator", "A"),
                mkResult("Charlie", 100, 0.15, 120, 130, 110, 80, "underestimator", "B")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(3, resp.leaders().size());
                    assertEquals(3, resp.total());
                    assertEquals("Bob", resp.leaders().get(0).name());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals("Charlie", resp.leaders().get(1).name());
                    assertEquals(2, resp.leaders().get(1).rank());
                    assertEquals("Alice", resp.leaders().get(2).name());
                    assertEquals(3, resp.leaders().get(2).rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldAssignSameRankForTiedScores() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 100, 0.10, 60, 70, 50, 60, "overestimator", "A"),
                mkResult("Bob", 100, 0.12, 80, 90, 70, 70, "underestimator", "B"),
                mkResult("Charlie", 80, 0.18, 150, 160, 140, 100, "underestimator", "C")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(3, resp.leaders().size());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals("Alice", resp.leaders().get(0).name());
                    assertEquals(1, resp.leaders().get(1).rank());
                    assertEquals("Bob", resp.leaders().get(1).name());
                    assertEquals(3, resp.leaders().get(2).rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldLimitResults() {
        List<TimePerceptionResult> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) {
            rows.add(mkResult("Player" + i, 1000 - i * 10, 0.10, 80, 100, 70, 90, "overestimator", "B"));
        }
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(5))
                .assertNext(resp -> {
                    assertEquals(5, resp.leaders().size());
                    assertEquals(20, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldClampLimitBelowMin() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("Alice", 150, 0.10, 60, 70, 50, 60, "overestimator", "A")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(0))
                .assertNext(resp -> {
                    assertEquals(1, resp.leaders().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldClampLimitAboveMax() {
        List<TimePerceptionResult> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 200; i++) {
            rows.add(mkResult("Player" + i, 200 - i, 0.10, 80, 100, 70, 90, "overestimator", "B"));
        }
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(200))
                .assertNext(resp -> {
                    assertEquals(100, resp.leaders().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardShouldHandleEmptyData() {
        mockSelectAll(List.of());

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertTrue(resp.leaders().isEmpty());
                    assertEquals(0, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void leaderboardEntriesShouldContainCorrectFields() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("TestPlayer", 150, 0.1234, 80.5, 100, 70, 90, "overestimator", "A")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    TimePerceptionLeaderboardEntry entry = resp.leaders().get(0);
                    assertEquals(1, entry.rank());
                    assertEquals("TestPlayer", entry.name());
                    assertEquals(150, entry.score());
                    assertEquals("A", entry.grade());
                    assertEquals(0.1234, entry.weber());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldCalculateBiasRatiosCorrectly() {
        List<TimePerceptionResult> rows = List.of(
                mkResult("A", 100, 0.10, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("B", 100, 0.10, 80, 100, 70, 90, "overestimator", "A"),
                mkResult("C", 100, 0.10, 80, 100, 70, 90, "underestimator", "A"),
                mkResult("D", 100, 0.10, 80, 100, 70, 90, "underestimator", "A"),
                mkResult("E", 100, 0.10, 80, 100, 70, 90, "underestimator", "A")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0.4, resp.global().overRatio());
                    assertEquals(0.6, resp.global().underRatio());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<TimePerceptionResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(TimePerceptionResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(TimePerceptionResult.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<TimePerceptionResult> rows) {
        ReactiveSelectOperation.ReactiveSelect<TimePerceptionResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(TimePerceptionResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static TimePerceptionResult mkResult(String playerName, int totalScore, double weberScore,
                                                  double avgAbsDistortion, double blankAvgDistortion,
                                                  double loadAvgDistortion, double emotionAvgDistortion,
                                                  String biasDirection, String grade) {
        return new TimePerceptionResult(null, playerName, totalScore, weberScore, avgAbsDistortion,
                blankAvgDistortion, loadAvgDistortion, emotionAvgDistortion, biasDirection, grade,
                System.currentTimeMillis());
    }
}
