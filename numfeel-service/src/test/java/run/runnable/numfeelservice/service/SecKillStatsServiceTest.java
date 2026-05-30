package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillScenarioStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SecKillSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SecKillStat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SecKillStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient client;

    private SecKillStatsService service;

    @BeforeEach
    void setUp() {
        service = new SecKillStatsService(template);
        when(template.getDatabaseClient()).thenReturn(client);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnSubmitResponseWithoutByScenario() {
        mockInsertSuccess();
        SecKillSubmitResponse expected = new SecKillSubmitResponse(100, 40, 0.4);
        mockSubmitStatsOne(expected);

        Mono<SecKillSubmitResponse> result = service.submit(50, 10, true, 3, 0.15, 0.02);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(100, resp.totalRuns());
                    assertEquals(40, resp.totalWins());
                    assertEquals(0.4, resp.winRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnZeroStatsWhenTableIsEmpty() {
        mockInsertSuccess();

        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total_runs"))).thenReturn(spec);

        RowsFetchSpec<SecKillSubmitResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.empty());

        Mono<SecKillSubmitResponse> result = service.submit(50, 10, false, 50, 1.0, 0.5);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0, resp.totalWins());
                    assertEquals(0.0, resp.winRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedDataWithScenarios() {
        SecKillStatsResponse statsResponse = new SecKillStatsResponse(200, 100, 0.5, List.of());
        List<SecKillScenarioStats> scenarios = List.of(
                new SecKillScenarioStats(100, 10, 50, 30, 0.6),
                new SecKillScenarioStats(50, 20, 30, 10, 0.33)
        );

        DatabaseClient.GenericExecuteSpec statsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec scenarioSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total_runs"))).thenReturn(statsSpec);
        when(client.sql(contains("GROUP BY participants"))).thenReturn(scenarioSpec);

        RowsFetchSpec<SecKillStatsResponse> statsRowsSpec = mock(RowsFetchSpec.class);
        when(statsSpec.map(any(BiFunction.class))).thenReturn(statsRowsSpec);
        when(statsRowsSpec.one()).thenReturn(Mono.just(statsResponse));

        RowsFetchSpec<SecKillScenarioStats> scenarioRowsSpec = mock(RowsFetchSpec.class);
        when(scenarioSpec.map(any(BiFunction.class))).thenReturn(scenarioRowsSpec);
        when(scenarioRowsSpec.all()).thenReturn(Flux.fromIterable(scenarios));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(200, resp.totalRuns());
                    assertEquals(100, resp.totalWins());
                    assertEquals(0.5, resp.winRate());
                    assertEquals(2, resp.byScenario().size());
                    assertEquals(100, resp.byScenario().get(0).participants());
                    assertEquals(10, resp.byScenario().get(0).stock());
                    assertEquals(50, resp.byScenario().get(0).count());
                    assertEquals(30, resp.byScenario().get(0).wins());
                    assertEquals(0.6, resp.byScenario().get(0).winRate());
                    assertEquals(50, resp.byScenario().get(1).participants());
                    assertEquals(20, resp.byScenario().get(1).stock());
                    assertEquals(0.33, resp.byScenario().get(1).winRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroStatsWhenTableIsEmpty() {
        SecKillStatsResponse emptyStats = new SecKillStatsResponse(0, 0, 0.0, List.of());

        DatabaseClient.GenericExecuteSpec statsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec scenarioSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total_runs"))).thenReturn(statsSpec);
        when(client.sql(contains("GROUP BY participants"))).thenReturn(scenarioSpec);

        RowsFetchSpec<SecKillStatsResponse> statsRowsSpec = mock(RowsFetchSpec.class);
        when(statsSpec.map(any(BiFunction.class))).thenReturn(statsRowsSpec);
        when(statsRowsSpec.one()).thenReturn(Mono.empty());

        RowsFetchSpec<SecKillScenarioStats> scenarioRowsSpec = mock(RowsFetchSpec.class);
        when(scenarioSpec.map(any(BiFunction.class))).thenReturn(scenarioRowsSpec);
        when(scenarioRowsSpec.all()).thenReturn(Flux.fromIterable(List.of()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0, resp.totalWins());
                    assertEquals(0.0, resp.winRate());
                    assertTrue(resp.byScenario().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldMergeStatsWithNonEmptyScenarios() {
        SecKillStatsResponse emptyStats = new SecKillStatsResponse(0, 0, 0.0, List.of());
        List<SecKillScenarioStats> scenarios = List.of(
                new SecKillScenarioStats(10, 5, 1, 1, 1.0)
        );

        DatabaseClient.GenericExecuteSpec statsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec scenarioSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total_runs"))).thenReturn(statsSpec);
        when(client.sql(contains("GROUP BY participants"))).thenReturn(scenarioSpec);

        RowsFetchSpec<SecKillStatsResponse> statsRowsSpec = mock(RowsFetchSpec.class);
        when(statsSpec.map(any(BiFunction.class))).thenReturn(statsRowsSpec);
        when(statsRowsSpec.one()).thenReturn(Mono.empty());

        RowsFetchSpec<SecKillScenarioStats> scenarioRowsSpec = mock(RowsFetchSpec.class);
        when(scenarioSpec.map(any(BiFunction.class))).thenReturn(scenarioRowsSpec);
        when(scenarioRowsSpec.all()).thenReturn(Flux.fromIterable(scenarios));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0, resp.totalWins());
                    assertEquals(0.0, resp.winRate());
                    assertEquals(1, resp.byScenario().size());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<SecKillStat> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(SecKillStat.class)).thenReturn(insertMock);
        when(insertMock.using(any(SecKillStat.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSubmitStatsOne(SecKillSubmitResponse expected) {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total_runs"))).thenReturn(spec);

        RowsFetchSpec<SecKillSubmitResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.just(expected));
    }
}
