package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.BarnumResult;
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
class BarnumStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private BarnumStatsService service;

    @BeforeEach
    void setUp() {
        service = new BarnumStatsService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertEntityAndComplete() {
        ReactiveInsertOperation.ReactiveInsert<BarnumResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BarnumResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(BarnumResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("tarot", 5, 4, 3, 2, 1))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldAcceptRandomGroup() {
        ReactiveInsertOperation.ReactiveInsert<BarnumResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BarnumResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(BarnumResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("random", 1, 2, 3, 4, 5))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        long now = System.currentTimeMillis();
        List<BarnumResult> rows = List.of(
                new BarnumResult(1L, "tarot", 5, 5, 5, 5, 5, 5.0, now),
                new BarnumResult(2L, "tarot", 1, 1, 1, 1, 1, 1.0, now),
                new BarnumResult(3L, "random", 3, 3, 3, 3, 3, 3.0, now)
        );

        ReactiveSelectOperation.ReactiveSelect<BarnumResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BarnumResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3.0, resp.tarotAvg());
                    assertEquals(3.0, resp.randomAvg());
                    assertEquals(2, resp.tarotCount());
                    assertEquals(1, resp.randomCount());
                    assertEquals(0.0, resp.diff());
                    assertEquals(0, resp.diffPercent());
                    assertEquals(List.of(5, 0, 0, 0, 5), resp.tarotDistribution());
                    assertEquals(List.of(0, 0, 5, 0, 0), resp.randomDistribution());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroForEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<BarnumResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BarnumResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0.0, resp.tarotAvg());
                    assertEquals(0.0, resp.randomAvg());
                    assertEquals(0, resp.tarotCount());
                    assertEquals(0, resp.randomCount());
                    assertEquals(0.0, resp.diff());
                    assertEquals(0, resp.diffPercent());
                    assertEquals(List.of(0, 0, 0, 0, 0), resp.tarotDistribution());
                    assertEquals(List.of(0, 0, 0, 0, 0), resp.randomDistribution());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleOnlyTarotGroup() {
        long now = System.currentTimeMillis();
        List<BarnumResult> rows = List.of(
                new BarnumResult(1L, "tarot", 4, 4, 4, 4, 4, 4.0, now),
                new BarnumResult(2L, "tarot", 2, 2, 2, 2, 2, 2.0, now)
        );

        ReactiveSelectOperation.ReactiveSelect<BarnumResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BarnumResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3.0, resp.tarotAvg());
                    assertEquals(0.0, resp.randomAvg());
                    assertEquals(2, resp.tarotCount());
                    assertEquals(0, resp.randomCount());
                    assertEquals(3.0, resp.diff());
                    assertEquals(0, resp.diffPercent());
                    assertEquals(List.of(0, 5, 0, 5, 0), resp.tarotDistribution());
                    assertEquals(List.of(0, 0, 0, 0, 0), resp.randomDistribution());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleAllRandomGroup() {
        long now = System.currentTimeMillis();
        List<BarnumResult> rows = List.of(
                new BarnumResult(1L, "random", 3, 4, 3, 4, 3, 3.4, now),
                new BarnumResult(2L, "random", 2, 3, 4, 2, 4, 3.0, now)
        );

        ReactiveSelectOperation.ReactiveSelect<BarnumResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BarnumResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0.0, resp.tarotAvg());
                    assertEquals(3.2, resp.randomAvg());
                    assertEquals(0, resp.tarotCount());
                    assertEquals(2, resp.randomCount());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldComputeDiffWhenTarotHigherThanRandom() {
        long now = System.currentTimeMillis();
        List<BarnumResult> rows = List.of(
                new BarnumResult(1L, "tarot", 4, 4, 4, 4, 4, 4.0, now),
                new BarnumResult(2L, "random", 2, 2, 2, 2, 2, 2.0, now)
        );

        ReactiveSelectOperation.ReactiveSelect<BarnumResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BarnumResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(4.0, resp.tarotAvg());
                    assertEquals(2.0, resp.randomAvg());
                    assertEquals(2.0, resp.diff());
                    assertEquals(100, resp.diffPercent());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<BarnumResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BarnumResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(BarnumResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        StepVerifier.create(service.submit("tarot", 1, 2, 3, 4, 5))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void multipleSubmitThenStatsShouldAggregateAll() {
        ReactiveInsertOperation.ReactiveInsert<BarnumResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BarnumResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(BarnumResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("tarot", 5, 5, 5, 5, 5))
                .verifyComplete();
        StepVerifier.create(service.submit("tarot", 1, 1, 1, 1, 1))
                .verifyComplete();
        StepVerifier.create(service.submit("random", 3, 3, 3, 3, 3))
                .verifyComplete();

        verify(insertMock, times(3)).using(any(BarnumResult.class));
    }
}
