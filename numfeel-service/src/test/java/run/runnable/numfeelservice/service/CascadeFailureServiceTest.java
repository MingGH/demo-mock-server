package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.CascadeFailureResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.Collections;
import java.util.List;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CascadeFailureServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient client;

    private CascadeFailureService service;

    @BeforeEach
    void setUp() {
        service = new CascadeFailureService(template);
        lenient().when(template.getDatabaseClient()).thenReturn(client);
    }

    private static CascadeFailureResult toResult(long id, String topology, int coupling, int capacity,
                                                  String strategy, String triggerPos, double survivalRate,
                                                  int cascadeSteps, int maxComponent, int totalNodes, int score) {
        return new CascadeFailureResult(id, topology, coupling, capacity, strategy, triggerPos,
                survivalRate, cascadeSteps, maxComponent, totalNodes, score, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnSubmitResponse() {
        ReactiveInsertOperation.ReactiveInsert<CascadeFailureResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CascadeFailureResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CascadeFailureResult.class))).thenReturn(Mono.empty());

        List<CascadeFailureResult> rows = List.of(
                toResult(1L, "mesh", 50, 100, "random", "center", 0.75, 3, 20, 100, 80)
        );
        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("mesh", 50, 100, "random", "center",
                        0.75, 3, 20, 100, 80))
                .assertNext(resp -> {
                    assertEquals(1, resp.totalRuns());
                    assertEquals(80, resp.yourScore());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldCountMultipleRecords() {
        ReactiveInsertOperation.ReactiveInsert<CascadeFailureResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CascadeFailureResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CascadeFailureResult.class))).thenReturn(Mono.empty());

        List<CascadeFailureResult> rows = List.of(
                toResult(1L, "scale-free", 80, 200, "targeted", "hub", 0.30, 8, 50, 200, 60),
                toResult(2L, "mesh", 50, 100, "random", "center", 0.75, 3, 20, 100, 80),
                toResult(3L, "ring", 30, 150, "degree", "edge", 0.90, 2, 80, 150, 95)
        );
        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("ring", 30, 150, "degree", "edge",
                        0.90, 2, 80, 150, 95))
                .assertNext(resp -> {
                    assertEquals(3, resp.totalRuns());
                    assertEquals(95, resp.yourScore());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<CascadeFailureResult> rows = List.of(
                toResult(1L, "mesh", 50, 100, "random", "center", 0.75, 3, 20, 100, 80),
                toResult(2L, "mesh", 60, 120, "targeted", "edge", 0.85, 5, 30, 100, 90),
                toResult(3L, "scale-free", 80, 200, "targeted", "hub", 0.30, 8, 50, 200, 60)
        );

        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertNotNull(resp.global());
                    assertEquals(3, resp.global().totalRuns());
                    assertTrue(resp.global().avgSurvival() > 0);
                    assertTrue(resp.global().avgSteps() > 0);
                    assertTrue(resp.global().avgScore() > 0);
                    assertNotNull(resp.byTopology());
                    assertTrue(resp.byTopology().size() >= 1);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertNotNull(resp.global());
                    assertEquals(0, resp.global().totalRuns());
                    assertEquals(0.0, resp.global().avgSurvival());
                    assertNotNull(resp.byTopology());
                    assertTrue(resp.byTopology().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldGroupByTopology() {
        List<CascadeFailureResult> rows = List.of(
                toResult(1L, "mesh", 50, 100, "random", "center", 0.75, 3, 20, 100, 80),
                toResult(2L, "mesh", 60, 120, "targeted", "edge", 0.85, 5, 30, 100, 90),
                toResult(3L, "ring", 30, 150, "degree", "edge", 0.90, 2, 80, 150, 95)
        );

        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertNotNull(resp.byTopology());
                    var meshStats = resp.byTopology().stream()
                            .filter(t -> "mesh".equals(t.topology())).findFirst();
                    assertTrue(meshStats.isPresent());
                    assertEquals(2, meshStats.get().count());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void leaderboardShouldReturnRankedEntries() {
        DatabaseClient.GenericExecuteSpec leaderSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("LIMIT"))).thenReturn(leaderSpec);
        when(leaderSpec.bind(eq(0), anyInt())).thenReturn(leaderSpec);

        RowsFetchSpec leaderRowsSpec = mock(RowsFetchSpec.class);
        when(leaderSpec.map(any(BiFunction.class))).thenReturn(leaderRowsSpec);

        var entry1 = new run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardEntry(
                "mesh", "targeted", 0.85, 5, 90, 1700000000000L, 0);
        var entry2 = new run.runnable.numfeelservice.controller.dto.GameplayResponses.CascadeFailureLeaderboardEntry(
                "ring", "degree", 0.90, 2, 95, 1700000001000L, 0);
        when(leaderRowsSpec.all()).thenReturn(Flux.just(entry1, entry2));

        DatabaseClient.GenericExecuteSpec countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT"))).thenReturn(countSpec);

        RowsFetchSpec countRowsSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowsSpec);
        when(countRowsSpec.one()).thenReturn(Mono.just(5));

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(5, resp.total());
                    assertEquals(2, resp.leaders().size());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals(2, resp.leaders().get(1).rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void leaderboardShouldHandleEmptyResults() {
        DatabaseClient.GenericExecuteSpec leaderSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("LIMIT"))).thenReturn(leaderSpec);
        when(leaderSpec.bind(eq(0), anyInt())).thenReturn(leaderSpec);

        RowsFetchSpec leaderRowsSpec = mock(RowsFetchSpec.class);
        when(leaderSpec.map(any(BiFunction.class))).thenReturn(leaderRowsSpec);
        when(leaderRowsSpec.all()).thenReturn(Flux.empty());

        DatabaseClient.GenericExecuteSpec countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT"))).thenReturn(countSpec);

        RowsFetchSpec countRowsSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowsSpec);
        when(countRowsSpec.one()).thenReturn(Mono.empty());

        StepVerifier.create(service.leaderboard(10))
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertTrue(resp.leaders().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void leaderboardShouldClampLimitLow() {
        DatabaseClient.GenericExecuteSpec leaderSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("LIMIT"))).thenReturn(leaderSpec);
        when(leaderSpec.bind(eq(0), eq(1))).thenReturn(leaderSpec);

        RowsFetchSpec leaderRowsSpec = mock(RowsFetchSpec.class);
        when(leaderSpec.map(any(BiFunction.class))).thenReturn(leaderRowsSpec);
        when(leaderRowsSpec.all()).thenReturn(Flux.empty());

        DatabaseClient.GenericExecuteSpec countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT"))).thenReturn(countSpec);

        RowsFetchSpec countRowsSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowsSpec);
        when(countRowsSpec.one()).thenReturn(Mono.just(0));

        StepVerifier.create(service.leaderboard(0))
                .assertNext(resp -> assertEquals(0, resp.total()))
                .verifyComplete();

        verify(leaderSpec).bind(eq(0), eq(1));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void leaderboardShouldClampLimitHigh() {
        DatabaseClient.GenericExecuteSpec leaderSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("LIMIT"))).thenReturn(leaderSpec);
        when(leaderSpec.bind(eq(0), eq(100))).thenReturn(leaderSpec);

        RowsFetchSpec leaderRowsSpec = mock(RowsFetchSpec.class);
        when(leaderSpec.map(any(BiFunction.class))).thenReturn(leaderRowsSpec);
        when(leaderRowsSpec.all()).thenReturn(Flux.empty());

        DatabaseClient.GenericExecuteSpec countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT"))).thenReturn(countSpec);

        RowsFetchSpec countRowsSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowsSpec);
        when(countRowsSpec.one()).thenReturn(Mono.just(0));

        StepVerifier.create(service.leaderboard(200))
                .assertNext(resp -> assertEquals(0, resp.total()))
                .verifyComplete();

        verify(leaderSpec).bind(eq(0), eq(100));
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldComputeHighSurvivalRateCorrectly() {
        List<CascadeFailureResult> rows = List.of(
                toResult(1L, "mesh", 50, 100, "random", "center", 0.90, 3, 20, 100, 80),
                toResult(2L, "mesh", 60, 120, "targeted", "edge", 0.85, 5, 30, 100, 90),
                toResult(3L, "scale-free", 80, 200, "targeted", "hub", 0.30, 8, 50, 200, 60),
                toResult(4L, "ring", 30, 150, "degree", "edge", 0.50, 2, 80, 150, 95)
        );

        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0.5, resp.global().highSurvivalRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void leaderboardShouldPropagateSqlError() {
        DatabaseClient.GenericExecuteSpec leaderSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("LIMIT"))).thenReturn(leaderSpec);
        when(leaderSpec.bind(eq(0), anyInt())).thenReturn(leaderSpec);

        RowsFetchSpec errorRowsSpec = mock(RowsFetchSpec.class);
        when(leaderSpec.map(any(BiFunction.class))).thenReturn(errorRowsSpec);
        when(errorRowsSpec.all()).thenReturn(Flux.error(new RuntimeException("SQL error")));

        DatabaseClient.GenericExecuteSpec countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT"))).thenReturn(countSpec);
        RowsFetchSpec countRowsSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowsSpec);
        when(countRowsSpec.one()).thenReturn(Mono.just(0));

        StepVerifier.create(service.leaderboard(10))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<CascadeFailureResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CascadeFailureResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CascadeFailureResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        ReactiveSelectOperation.ReactiveSelect<CascadeFailureResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CascadeFailureResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.submit("mesh", 50, 100, "random", "center",
                        0.75, 3, 20, 100, 80))
                .verifyError(RuntimeException.class);
    }
}
