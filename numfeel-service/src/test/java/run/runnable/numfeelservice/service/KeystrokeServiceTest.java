package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.KeystrokeStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.KeystrokeProfile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.r2dbc.core.DatabaseClient;
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

    @Mock
    private DatabaseClient db;

    private KeystrokeService service;

    @BeforeEach
    void setUp() {
        service = new KeystrokeService(template, db);
    }

    private static KeystrokeProfile toProfile(long id, String sessionId, int sampleIndex,
                                              String hold, String intervals, int totalMs, int err, long createdAt) {
        return new KeystrokeProfile(id, sessionId, sampleIndex, "abc123",
                hold, intervals, totalMs, err, createdAt);
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
    void aggregateStatsShouldReturnAggregatedData() {
        List<KeystrokeProfile> rows = List.of(
                toProfile(1L, "s-a", 0, "[100,100,100]", "[200,200]", 9000, 0, 1_000_000L),
                toProfile(2L, "s-a", 1, "[100,100,100]", "[200,200]", 9000, 0, 1_100_000L),
                toProfile(3L, "s-b", 0, "[60,60,60]", "[120,120]", 5000, 2, 2_000_000L)
        );
        KeystrokeStatsResponse resp =
                KeystrokeService.aggregateStats(rows, 3, 7666.7, "s-a");
        assertEquals(3, resp.totalSamples());
        assertEquals(7666.7, resp.avgTotalMs(), 0.1);
        assertEquals(86.7, resp.avgHoldMs(), 0.1);
        assertEquals(173.3, resp.avgIntervalMs(), 0.1);
        assertEquals(2, resp.sampleCount());
        // s-a 与 s-b：hold 差 40（归一化 /200 → 0.2），interval 差 80（/500 → 0.16）
        // 0.6*0.2 + 0.4*0.16 = 0.184 → 0.2
        assertEquals(0.2, resp.nearestDistance(), 0.01);
        // 距离 0.2 ≤ 识别阈值 0.5 → 判定同一人此前来过，回告 s-b 最近提交时间
        assertEquals(2_000_000L, resp.lastSeenAt());
    }

    @Test
    void aggregateStatsShouldNotIdentifyWhenDistanceTooLarge() {
        List<KeystrokeProfile> rows = List.of(
                toProfile(1L, "s-a", 0, "[100,100,100]", "[200,200]", 9000, 0, 1_000_000L),
                toProfile(2L, "s-a", 1, "[100,100,100]", "[200,200]", 9000, 0, 1_100_000L),
                toProfile(3L, "s-b", 0, "[600,600,600]", "[200,200]", 9000, 0, 2_000_000L)
        );
        KeystrokeStatsResponse resp =
                KeystrokeService.aggregateStats(rows, 3, 9000, "s-a");
        // hold 差 500（/200 → 2.5）→ 0.6*2.5 = 1.5 > 0.5 → 不识别
        assertEquals(1.5, resp.nearestDistance(), 0.01);
        assertEquals(-1, resp.lastSeenAt());
    }

    @Test
    void aggregateStatsShouldHandleEmptyData() {
        KeystrokeStatsResponse resp =
                KeystrokeService.aggregateStats(Collections.emptyList(), 0, 0, "s-a");
        assertEquals(0, resp.totalSamples());
        assertEquals(0.0, resp.avgTotalMs());
        assertEquals(0.0, resp.avgHoldMs());
        assertEquals(0.0, resp.avgIntervalMs());
        assertEquals(-1, resp.nearestDistance());
        assertEquals(0, resp.sampleCount());
        assertEquals(-1, resp.lastSeenAt());
    }

    @Test
    void aggregateStatsShouldReturnNearestMinusOneWhenNoOthers() {
        List<KeystrokeProfile> rows = List.of(
                toProfile(1L, "s-a", 0, "[100]", "[200]", 1000, 0, 1_000_000L)
        );
        KeystrokeStatsResponse resp =
                KeystrokeService.aggregateStats(rows, 1, 1000, "s-a");
        assertEquals(1, resp.sampleCount());
        assertEquals(-1, resp.nearestDistance());
        assertEquals(-1, resp.lastSeenAt());
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
