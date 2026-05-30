package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.CosmicReaperResult;
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

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CosmicReaperServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private CosmicReaperService service;

    @BeforeEach
    void setUp() {
        service = new CosmicReaperService(template);
    }

    private static CosmicReaperResult toResult(long id, String strategy, boolean escaped, int turns,
                                                int score, int finalTech, int finalSignal, int finalStealth) {
        return new CosmicReaperResult(id, strategy, escaped, turns, score,
                finalTech, finalSignal, finalStealth, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnStatsAfterInsert() {
        ReactiveInsertOperation.ReactiveInsert<CosmicReaperResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CosmicReaperResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CosmicReaperResult.class))).thenReturn(Mono.empty());

        List<CosmicReaperResult> rows = List.of(
                toResult(1L, "stealth", true, 5, 100, 10, 20, 30),
                toResult(2L, "aggressive", false, 8, 150, 5, 15, 25)
        );

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("stealth", true, 5, 100, 10, 20, 30))
                .assertNext(resp -> {
                    assertEquals(2, resp.totalRuns());
                    assertEquals(50.0, resp.escapeRate());
                    assertEquals(125.0, resp.avgScore());
                    assertEquals(6.5, resp.avgTurns());
                    assertNotNull(resp.topStrategy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertAgainstEmptyDataset() {
        ReactiveInsertOperation.ReactiveInsert<CosmicReaperResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CosmicReaperResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CosmicReaperResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.submit("stealth", true, 5, 100, 10, 20, 30))
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0.0, resp.escapeRate());
                    assertEquals(0.0, resp.avgScore());
                    assertEquals(0.0, resp.avgTurns());
                    assertEquals("-", resp.topStrategy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnAggregatedData() {
        List<CosmicReaperResult> rows = List.of(
                toResult(1L, "stealth", true, 5, 100, 10, 20, 30),
                toResult(2L, "stealth", true, 3, 120, 15, 25, 35),
                toResult(3L, "aggressive", false, 8, 150, 5, 15, 25),
                toResult(4L, "defensive", false, 10, 80, 20, 5, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(4, resp.totalRuns());
                    assertEquals(50.0, resp.escapeRate());
                    assertEquals(112.5, resp.avgScore());
                    assertEquals(6.5, resp.avgTurns());
                    assertEquals("stealth", resp.topStrategy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRuns());
                    assertEquals(0.0, resp.escapeRate());
                    assertEquals(0.0, resp.avgScore());
                    assertEquals(0.0, resp.avgTurns());
                    assertEquals("-", resp.topStrategy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldHandleAllEscaped() {
        List<CosmicReaperResult> rows = List.of(
                toResult(1L, "stealth", true, 3, 200, 50, 10, 5),
                toResult(2L, "aggressive", true, 4, 180, 30, 20, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(2, resp.totalRuns());
                    assertEquals(100.0, resp.escapeRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldHandleNoneEscaped() {
        List<CosmicReaperResult> rows = List.of(
                toResult(1L, "defensive", false, 10, 50, 20, 5, 10),
                toResult(2L, "aggressive", false, 8, 60, 5, 15, 25)
        );

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(0.0, resp.escapeRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void getStatsShouldReturnTopStrategy() {
        List<CosmicReaperResult> rows = List.of(
                toResult(1L, "stealth", true, 5, 100, 10, 20, 30),
                toResult(2L, "stealth", false, 7, 80, 12, 18, 22),
                toResult(3L, "aggressive", true, 6, 120, 8, 22, 15),
                toResult(4L, "stealth", true, 4, 110, 15, 25, 35),
                toResult(5L, "defensive", false, 9, 70, 18, 8, 12)
        );

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals("stealth", resp.topStrategy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<CosmicReaperResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CosmicReaperResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CosmicReaperResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        ReactiveSelectOperation.ReactiveSelect<CosmicReaperResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CosmicReaperResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.submit("stealth", true, 5, 100, 10, 20, 30))
                .verifyError(RuntimeException.class);
    }
}
