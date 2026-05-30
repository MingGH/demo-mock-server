package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayRequests.InceptionMazeSubmitRequest;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InceptionMazeStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InceptionMazeSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.InceptionMazeResult;
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
class InceptionMazeServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private InceptionMazeService service;

    @BeforeEach
    void setUp() {
        service = new InceptionMazeService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankAndPercentile() {
        mockInsertSuccess();
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.15, 60, 8, 1, 20, 50),
                mkResult(0.25, 40, 5, 3, 15, 35)
        );
        mockSelectAll(rows);

        InceptionMazeSubmitRequest req = new InceptionMazeSubmitRequest(10, 50, 40, 0.2, 2, 6);

        StepVerifier.create(service.submit(req))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                    assertEquals(2, resp.total());
                    assertTrue(resp.percentile() >= 0);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankOneForBestDetourRatio() {
        mockInsertSuccess();
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.3, 80, 10, 2, 25, 60),
                mkResult(0.5, 100, 12, 4, 30, 80)
        );
        mockSelectAll(rows);

        InceptionMazeSubmitRequest req = new InceptionMazeSubmitRequest(10, 40, 30, 0.1, 1, 3);

        StepVerifier.create(service.submit(req))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(2, resp.total());
                    assertEquals(50, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPlaceAtEndWithWorstDetourRatio() {
        mockInsertSuccess();
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.1, 50, 5, 0, 10, 40),
                mkResult(0.2, 60, 7, 1, 15, 50),
                mkResult(0.8, 120, 20, 5, 20, 80)
        );
        mockSelectAll(rows);

        InceptionMazeSubmitRequest req = new InceptionMazeSubmitRequest(20, 120, 80, 0.8, 5, 20);

        StepVerifier.create(service.submit(req))
                .assertNext(resp -> {
                    assertEquals(3, resp.rank());
                    assertEquals(3, resp.total());
                    assertEquals(0, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnPercentileFiftyWhenTableEmpty() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        InceptionMazeSubmitRequest req = new InceptionMazeSubmitRequest(5, 30, 25, 0.2, 1, 4);

        StepVerifier.create(service.submit(req))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(0, resp.total());
                    assertEquals(50, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.1, 100, 10, 0, 30, 80),
                mkResult(0.2, 80, 8, 2, 25, 60),
                mkResult(0.3, 60, 6, 4, 20, 50)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.totalSessions());
                    assertEquals(0.2, resp.avgDetour());
                    assertEquals(0.3, resp.maxDetour());
                    assertEquals(80.0, resp.avgPath());
                    assertEquals(8.0, resp.avgWalls());
                    assertEquals(1L, resp.levelDist().get("0"));
                    assertEquals(0L, resp.levelDist().get("1"));
                    assertEquals(1L, resp.levelDist().get("2"));
                    assertEquals(0L, resp.levelDist().get("3"));
                    assertEquals(1L, resp.levelDist().get("4"));
                    assertEquals(0L, resp.levelDist().get("5"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnLevelDistributionAllZeroWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalSessions());
                    assertEquals(0.0, resp.avgDetour());
                    assertEquals(0.0, resp.maxDetour());
                    assertEquals(0.0, resp.avgPath());
                    assertEquals(0.0, resp.avgWalls());
                    for (int i = 0; i <= 5; i++) {
                        assertEquals(0L, resp.levelDist().get(String.valueOf(i)));
                    }
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleSingleRow() {
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.42, 77, 9, 3, 22, 55)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1, resp.totalSessions());
                    assertEquals(0.42, resp.avgDetour());
                    assertEquals(0.42, resp.maxDetour());
                    assertEquals(77.0, resp.avgPath());
                    assertEquals(9.0, resp.avgWalls());
                    assertEquals(1L, resp.levelDist().get("3"));
                    assertEquals(0L, resp.levelDist().get("0"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldAggregateMultipleSameLevelEntries() {
        List<InceptionMazeResult> rows = List.of(
                mkResult(0.1, 50, 5, 1, 10, 40),
                mkResult(0.2, 60, 6, 1, 15, 45),
                mkResult(0.3, 70, 7, 1, 20, 50)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3L, resp.levelDist().get("1"));
                    assertEquals(0L, resp.levelDist().get("0"));
                    assertEquals(0L, resp.levelDist().get("2"));
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<InceptionMazeResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(InceptionMazeResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(InceptionMazeResult.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<InceptionMazeResult> rows) {
        ReactiveSelectOperation.ReactiveSelect<InceptionMazeResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(InceptionMazeResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static InceptionMazeResult mkResult(double detourRatio, int pathLength, int wallCount,
                                                 int dreamLevel, int gridSize, int minPath) {
        return new InceptionMazeResult(null, gridSize, pathLength, minPath,
                detourRatio, dreamLevel, wallCount, System.currentTimeMillis());
    }
}
