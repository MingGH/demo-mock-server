package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingRequests.CaptchaLevels;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.CaptchaSubmitRequest;
import run.runnable.numfeelservice.model.TrackingEntities.CaptchaResult;
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
class CaptchaStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private CaptchaStatsService service;

    @BeforeEach
    void setUp() {
        service = new CaptchaStatsService(template);
    }

    private static CaptchaResult toResult(long id, int passedCount, int totalTimeMs, String grade,
                                           int lvText, int lvMath, int lvSlider, int lvGrid,
                                           int lvClick, int lvRotate, int lvSpatial, int lvBehavior,
                                           int timeText, int timeMath, int timeSlider, int timeGrid,
                                           int timeClick, int timeRotate, int timeSpatial, int timeBehavior) {
        return new CaptchaResult(id, passedCount, totalTimeMs, grade,
                lvText, lvMath, lvSlider, lvGrid, lvClick, lvRotate, lvSpatial, lvBehavior,
                timeText, timeMath, timeSlider, timeGrid, timeClick, timeRotate, timeSpatial, timeBehavior,
                System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankAndPercentile() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 8, 5000, "S", 1, 1, 1, 1, 1, 1, 1, 1, 500, 600, 700, 800, 900, 1000, 1100, 1200),
                toResult(2L, 6, 8000, "B", 1, 0, 1, 1, 0, 1, 1, 1, 1000, 900, 800, 700, 600, 500, 400, 300),
                toResult(3L, 8, 4000, "S", 1, 1, 1, 1, 1, 1, 1, 1, 400, 500, 600, 700, 800, 900, 1000, 1100)
        );

        ReactiveInsertOperation.ReactiveInsert<CaptchaResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CaptchaResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CaptchaResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        CaptchaLevels levels = new CaptchaLevels(1, 0, 1, 1, 1, 1, 1, 1,
                500, 600, 700, 800, 900, 1000, 1100, 1200);
        CaptchaSubmitRequest request = new CaptchaSubmitRequest(7, 7000, "A", levels);

        StepVerifier.create(service.submit(request))
                .assertNext(resp -> {
                    assertTrue(resp.totalSessions() >= 3);
                    assertTrue(resp.percentile() >= 0);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitWithHighestScoreShouldRankFirst() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 5, 9000, "C", 1, 0, 1, 0, 1, 0, 1, 0, 100, 200, 300, 400, 500, 600, 700, 800)
        );

        ReactiveInsertOperation.ReactiveInsert<CaptchaResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CaptchaResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CaptchaResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        CaptchaLevels levels = new CaptchaLevels(1, 1, 1, 1, 1, 1, 1, 1,
                100, 200, 300, 400, 500, 600, 700, 800);
        CaptchaSubmitRequest request = new CaptchaSubmitRequest(8, 1000, "S", levels);

        StepVerifier.create(service.submit(request))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitWithLowestScoreShouldRankLast() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 8, 1000, "S", 1, 1, 1, 1, 1, 1, 1, 1, 100, 200, 300, 400, 500, 600, 700, 800)
        );

        ReactiveInsertOperation.ReactiveInsert<CaptchaResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CaptchaResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CaptchaResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        CaptchaLevels levels = new CaptchaLevels(1, 0, 0, 0, 0, 0, 0, 0,
                100, 200, 300, 400, 500, 600, 700, 800);
        CaptchaSubmitRequest request = new CaptchaSubmitRequest(1, 9999, "F", levels);

        StepVerifier.create(service.submit(request))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitWithNullLevelsShouldDefaultToZero() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 4, 5000, "B", 0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0)
        );

        ReactiveInsertOperation.ReactiveInsert<CaptchaResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CaptchaResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CaptchaResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        CaptchaSubmitRequest request = new CaptchaSubmitRequest(4, 5000, "B", null);

        StepVerifier.create(service.submit(request))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 8, 5000, "S", 1, 1, 1, 1, 1, 1, 1, 1, 500, 600, 700, 800, 900, 1000, 1100, 1200),
                toResult(2L, 4, 3000, "F", 1, 0, 1, 0, 1, 0, 0, 0, 400, 500, 600, 700, 800, 900, 1000, 1100)
        );

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.global().totalSessions());
                    assertEquals(6.0, resp.global().avgPassed());
                    assertEquals(4.0, resp.global().avgTotalSec());
                    assertNotNull(resp.global().passRates());
                    assertNotNull(resp.global().avgTimes());
                    assertNotNull(resp.gradeDist());
                    assertTrue(resp.gradeDist().containsKey("S"));
                    assertTrue(resp.gradeDist().containsKey("F"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.global().totalSessions());
                    assertEquals(0.0, resp.global().avgPassed());
                    assertEquals(0.0, resp.global().avgTotalSec());
                    assertTrue(resp.gradeDist().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldComputePassRatesCorrectly() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 8, 1000, "S", 1, 1, 1, 1, 1, 1, 1, 1, 100, 200, 300, 400, 500, 600, 700, 800)
        );

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(100.0, resp.global().passRates().text());
                    assertEquals(100.0, resp.global().passRates().math());
                    assertEquals(100.0, resp.global().passRates().slider());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldComputeAvgTimesCorrectly() {
        List<CaptchaResult> rows = List.of(
                toResult(1L, 4, 2000, "B", 1, 0, 1, 0, 1, 0, 1, 0, 2000, 0, 3000, 0, 5000, 0, 7000, 0)
        );

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2.0, resp.global().avgTimes().text());
                    assertEquals(0.0, resp.global().avgTimes().math());
                    assertEquals(3.0, resp.global().avgTimes().slider());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<CaptchaResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(CaptchaResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(CaptchaResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        ReactiveSelectOperation.ReactiveSelect<CaptchaResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(CaptchaResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        CaptchaSubmitRequest request = new CaptchaSubmitRequest(4, 5000, "B", null);

        StepVerifier.create(service.submit(request))
                .verifyError(RuntimeException.class);
    }
}
