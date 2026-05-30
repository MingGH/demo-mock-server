package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.StroopSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.StroopResult;
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

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StroopStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private StroopStatsService service;

    @BeforeEach
    void setUp() {
        service = new StroopStatsService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankBasedOnStroopEffect() {
        mockInsertSuccess();
        List<StroopResult> rows = List.of(
                mkStroop(10, 8, 0.8, 500, 400, 600, 200, "B"),
                mkStroop(20, 18, 0.9, 300, 250, 350, 100, "A"),
                mkStroop(15, 12, 0.8, 450, 380, 520, 140, "B")
        );
        mockSelectAll(rows);

        Mono<StroopSubmitResponse> result = service.submit(20, 19, 0.95, 250, 200, 300, 50, "A+");

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(3, resp.totalSessions());
                    assertEquals(67, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPlaceAtEndWithWorstStroopEffect() {
        mockInsertSuccess();
        List<StroopResult> rows = List.of(
                mkStroop(10, 8, 0.8, 500, 400, 600, 50, "A+"),
                mkStroop(20, 18, 0.9, 300, 250, 350, 100, "A"),
                mkStroop(15, 12, 0.8, 450, 380, 520, 80, "A")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit(10, 5, 0.5, 800, 750, 850, 300, "D"))
                .assertNext(resp -> {
                    assertEquals(4, resp.rank());
                    assertEquals(3, resp.totalSessions());
                    assertEquals(-33, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleTiedStroopEffect() {
        mockInsertSuccess();
        List<StroopResult> rows = List.of(
                mkStroop(10, 8, 0.8, 500, 400, 600, 100, "A"),
                mkStroop(20, 18, 0.9, 300, 250, 350, 50, "A+")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit(15, 12, 0.8, 400, 350, 450, 100, "A"))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                    assertEquals(2, resp.totalSessions());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedGlobalStats() {
        List<StroopResult> rows = List.of(
                mkStroop(10, 8, 0.8, 500, 400, 600, 200, "B"),
                mkStroop(20, 18, 0.9, 300, 250, 350, 100, "A"),
                mkStroop(15, 12, 0.8, 450, 380, 520, 140, "B"),
                mkStroop(12, 10, 0.833, 400, 350, 450, 150, "B")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(4, resp.global().totalSessions());
                    assertEquals(147.5, resp.global().avgStroopEffect());
                    assertEquals(412.5, resp.global().avgRT());
                    assertEquals(83.3, resp.global().avgAccuracyPct());
                    assertEquals(100.0, resp.global().minStroopEffect());
                    assertEquals(200.0, resp.global().maxStroopEffect());
                    assertEquals(345.0, resp.global().avgConRT());
                    assertEquals(480.0, resp.global().avgIncRT());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnGradeDistribution() {
        List<StroopResult> rows = List.of(
                mkStroop(10, 8, 0.8, 500, 400, 600, 200, "B"),
                mkStroop(20, 18, 0.9, 300, 250, 350, 100, "A"),
                mkStroop(15, 12, 0.8, 450, 380, 520, 140, "B")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1L, resp.gradeDist().get("A"));
                    assertEquals(2L, resp.gradeDist().get("B"));
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
                    assertEquals(0.0, resp.global().avgStroopEffect());
                    assertEquals(0.0, resp.global().avgRT());
                    assertEquals(0.0, resp.global().avgAccuracyPct());
                    assertEquals(0.0, resp.global().minStroopEffect());
                    assertEquals(0.0, resp.global().maxStroopEffect());
                    assertTrue(resp.gradeDist().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnZeroPercentileWhenTableEmpty() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        StepVerifier.create(service.submit(20, 19, 0.95, 250, 200, 300, 50, "A+"))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                    assertEquals(0, resp.totalSessions());
                    assertEquals(0, resp.percentile());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleSingleRow() {
        List<StroopResult> rows = List.of(
                mkStroop(15, 12, 0.8, 450, 380, 520, 140, "B")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1, resp.global().totalSessions());
                    assertEquals(140.0, resp.global().avgStroopEffect());
                    assertEquals(140.0, resp.global().minStroopEffect());
                    assertEquals(140.0, resp.global().maxStroopEffect());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<StroopResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(StroopResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(StroopResult.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<StroopResult> rows) {
        ReactiveSelectOperation.ReactiveSelect<StroopResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(StroopResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static StroopResult mkStroop(int total, int correctCount, double accuracy,
                                         double avgRt, double conAvgRt, double incAvgRt,
                                         double stroopEffect, String grade) {
        return new StroopResult(null, total, correctCount, accuracy, avgRt, conAvgRt, incAvgRt,
                stroopEffect, grade, System.currentTimeMillis());
    }
}
