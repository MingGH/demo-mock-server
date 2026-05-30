package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeyLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeyStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.MonkeySubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.MonkeyStat;
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
class MonkeyStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private MonkeyStatsService service;

    @BeforeEach
    void setUp() {
        service = new MonkeyStatsService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnSubmitResponseWithoutLeaderboard() {
        mockInsertSuccess();
        List<MonkeyStat> rows = List.of(
                mkStat("hello", 5, 100, true),
                mkStat("hello world", 11, 500, true),
                mkStat("short", 5, 50, false)
        );
        mockSelectAll(rows);

        Mono<MonkeySubmitResponse> result = service.submit("test", 4, 200, 800, true, 30);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(3, resp.totalRuns());
                    assertEquals(2, resp.totalSuccesses());
                    assertEquals(0.667, resp.successRate());
                    assertEquals("hello world", resp.longestTarget());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnZeroStatsWhenTableIsEmpty() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        Mono<MonkeySubmitResponse> result = service.submit("test", 4, 200, 800, false, 30);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0, resp.totalSuccesses());
                    assertEquals(0.0, resp.successRate());
                    assertNull(resp.longestTarget());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleAllFailed() {
        mockInsertSuccess();
        List<MonkeyStat> rows = List.of(
                mkStat("fail1", 5, 100, false),
                mkStat("fail2", 10, 200, false)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("test", 4, 300, 1200, false, 30))
                .assertNext(resp -> {
                    assertEquals(2, resp.totalRuns());
                    assertEquals(0, resp.totalSuccesses());
                    assertEquals(0.0, resp.successRate());
                    assertNull(resp.longestTarget());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldChooseLongestTargetAmongSuccesses() {
        mockInsertSuccess();
        List<MonkeyStat> rows = List.of(
                mkStat("abc", 3, 50, true),
                mkStat("abcdefghij", 10, 300, true),
                mkStat("abcdefgh", 8, 200, false),
                mkStat("abcdef", 6, 150, true)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("test", 4, 100, 400, true, 30))
                .assertNext(resp -> {
                    assertEquals(4, resp.totalRuns());
                    assertEquals(3, resp.totalSuccesses());
                    assertEquals("abcdefghij", resp.longestTarget());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedDataWithLeaderboard() {
        List<MonkeyStat> rows = List.of(
                mkStat("hello", 5, 100, true),
                mkStat("hello world", 11, 500, true),
                mkStat("the quick brown fox", 19, 1000, true),
                mkStat("hello world long", 16, 700, true),
                mkStat("short", 5, 50, false),
                mkStat("fail", 4, 30, false)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(6, resp.totalRuns());
                    assertEquals(4, resp.totalSuccesses());
                    assertEquals(0.667, resp.successRate());
                    assertEquals("the quick brown fox", resp.longestTarget());
                    assertNotNull(resp.leaderboard());
                    assertFalse(resp.leaderboard().isEmpty());
                    resp.leaderboard().forEach(e -> assertTrue(e.success()));
                    assertEquals("the quick brown fox", resp.leaderboard().get(0).targetText());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroStatsWhenTableIsEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0, resp.totalSuccesses());
                    assertEquals(0.0, resp.successRate());
                    assertNull(resp.longestTarget());
                    assertNotNull(resp.leaderboard());
                    assertTrue(resp.leaderboard().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnNoLongestTargetWhenAllFailed() {
        List<MonkeyStat> rows = List.of(
                mkStat("fail1", 5, 100, false),
                mkStat("fail2", 10, 200, false)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.totalRuns());
                    assertEquals(0, resp.totalSuccesses());
                    assertEquals(0.0, resp.successRate());
                    assertNull(resp.longestTarget());
                    assertEquals(0, resp.leaderboard().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldLimitLeaderboardTo10() {
        List<MonkeyStat> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) {
            rows.add(mkStat("target-" + i, 10 + i, 100 * (i + 1), true));
        }
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(10, resp.leaderboard().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsLeaderboardEntriesShouldContainCorrectFields() {
        List<MonkeyStat> rows = List.of(
                mkStat("test target", 11, 500, true)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1, resp.leaderboard().size());
                    MonkeyLeaderboardEntry entry = resp.leaderboard().get(0);
                    assertEquals("test target", entry.targetText());
                    assertEquals(11, entry.targetLength());
                    assertEquals(500, entry.totalAttempts());
                    assertTrue(entry.success());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<MonkeyStat> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(MonkeyStat.class)).thenReturn(insertMock);
        when(insertMock.using(any(MonkeyStat.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<MonkeyStat> rows) {
        ReactiveSelectOperation.ReactiveSelect<MonkeyStat> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(MonkeyStat.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static MonkeyStat mkStat(String targetText, int targetLength, long totalAttempts, boolean success) {
        return new MonkeyStat(null, targetText, targetLength, totalAttempts,
                targetLength * totalAttempts, success, 30, System.currentTimeMillis());
    }
}
