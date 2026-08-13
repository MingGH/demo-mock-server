package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.KeystrokeProfile;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KeystrokeServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private KeystrokeService service;

    @BeforeEach
    void setUp() {
        service = new KeystrokeService(template);
    }

    private static KeystrokeProfile toProfile(long id, String sessionId, int sampleIndex,
                                              String hold, String intervals, int totalMs, int err) {
        return new KeystrokeProfile(id, sessionId, sampleIndex, "abc123",
                hold, intervals, totalMs, err, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecord() {
        ReactiveInsertOperation.ReactiveInsert<KeystrokeProfile> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(KeystrokeProfile.class)).thenReturn(insertMock);
        when(insertMock.using(any(KeystrokeProfile.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("s1", 0, "abc123", "[80,90,75]", "[120,95]", 5000, 1))
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.sampleIndex() == 0
                        && e.totalMs() == 5000
                        && e.errorCount() == 1
                        && "[80,90,75]".equals(e.holdTimes())
                        && "[120,95]".equals(e.intervals())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<KeystrokeProfile> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(KeystrokeProfile.class)).thenReturn(insertMock);
        when(insertMock.using(any(KeystrokeProfile.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        StepVerifier.create(service.submit("s1", 0, "abc123", "[80]", "[120]", 1000, 0))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<KeystrokeProfile> rows = List.of(
                toProfile(1L, "s-a", 0, "[100,100,100]", "[200,200]", 9000, 0),
                toProfile(2L, "s-a", 1, "[100,100,100]", "[200,200]", 9000, 0),
                toProfile(3L, "s-b", 0, "[60,60,60]", "[120,120]", 5000, 2)
        );
        ReactiveSelectOperation.ReactiveSelect<KeystrokeProfile> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(KeystrokeProfile.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats("s-a"))
                .assertNext(resp -> {
                    assertEquals(3, resp.totalSamples());
                    assertEquals(7666.7, resp.avgTotalMs(), 0.1);
                    assertEquals(86.7, resp.avgHoldMs(), 0.1);
                    assertEquals(173.3, resp.avgIntervalMs(), 0.1);
                    assertEquals(2, resp.sampleCount());
                    // s-a 的样本与 s-b 距离：hold 差 40，interval 差 80
                    // 0.6*40 + 0.4*80 = 24 + 32 = 56
                    assertEquals(56.0, resp.nearestDistance(), 0.1);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<KeystrokeProfile> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(KeystrokeProfile.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats("s-a"))
                .assertNext(resp -> {
                    assertEquals(0, resp.totalSamples());
                    assertEquals(0.0, resp.avgTotalMs());
                    assertEquals(0.0, resp.avgHoldMs());
                    assertEquals(0.0, resp.avgIntervalMs());
                    assertEquals(-1, resp.nearestDistance());
                    assertEquals(0, resp.sampleCount());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnNearestMinusOneWhenNoOthers() {
        List<KeystrokeProfile> rows = List.of(
                toProfile(1L, "s-a", 0, "[100]", "[200]", 1000, 0)
        );
        ReactiveSelectOperation.ReactiveSelect<KeystrokeProfile> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(KeystrokeProfile.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats("s-a"))
                .assertNext(resp -> {
                    assertEquals(1, resp.sampleCount());
                    assertEquals(-1, resp.nearestDistance());
                })
                .verifyComplete();
    }

    @Test
    void parseListShouldHandleValidJson() {
        assertEquals(List.of(1, 2, 3), KeystrokeService.parseList("[1,2,3]"));
    }

    @Test
    void parseListShouldHandleMalformedJson() {
        assertTrue(KeystrokeService.parseList("not-json").isEmpty());
        assertTrue(KeystrokeService.parseList(null).isEmpty());
        assertTrue(KeystrokeService.parseList("").isEmpty());
    }
}
