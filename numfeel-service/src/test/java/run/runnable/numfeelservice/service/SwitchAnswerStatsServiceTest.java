package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.DailyTrend;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.SwitchAnswerSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.SwitchAnswerRound;
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

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SwitchAnswerStatsServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private SwitchAnswerStatsService service;

    @BeforeEach
    void setUp() {
        service = new SwitchAnswerStatsService(template);
    }

    // ─── submit 测试 ───

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnCorrectStatsSnapshot() {
        mockInsertSuccess();
        List<SwitchAnswerRound> rows = List.of(
                mkRound("stay", true, "1.1.1.1"),
                mkRound("switch", true, "1.1.1.1"),
                mkRound("switch", true, "2.2.2.2"),
                mkRound("stay", false, "2.2.2.2")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("switch", true, 4, 2, "3.3.3.3"))
                .assertNext(resp -> {
                    assertEquals(4, resp.totalRounds());
                    assertEquals(2, resp.stayRounds());
                    assertEquals(1, resp.stayWins());
                    assertEquals(0.5, resp.stayWinRate());
                    assertEquals(2, resp.switchRounds());
                    assertEquals(2, resp.switchWins());
                    assertEquals(1.0, resp.switchWinRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnZeroStatsWhenEmpty() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        StepVerifier.create(service.submit("stay", false, 4, 2, "1.1.1.1"))
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRounds());
                    assertEquals(0, resp.stayRounds());
                    assertEquals(0, resp.stayWins());
                    assertEquals(0.0, resp.stayWinRate());
                    assertEquals(0, resp.switchRounds());
                    assertEquals(0, resp.switchWins());
                    assertEquals(0.0, resp.switchWinRate());
                })
                .verifyComplete();
    }

    // ─── stats 测试 ───

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldAggregateCorrectly() {
        List<SwitchAnswerRound> rows = List.of(
                mkRound("stay", true, "1.1.1.1"),
                mkRound("stay", false, "1.1.1.1"),
                mkRound("stay", false, "2.2.2.2"),
                mkRound("switch", true, "1.1.1.1"),
                mkRound("switch", true, "2.2.2.2"),
                mkRound("switch", true, "3.3.3.3"),
                mkRound("switch", false, "3.3.3.3")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(7, resp.totalRounds());
                    // stay: 3 rounds, 1 win
                    assertEquals(3, resp.stayRounds());
                    assertEquals(1, resp.stayWins());
                    assertEquals(0.333, resp.stayWinRate());
                    // switch: 4 rounds, 3 wins
                    assertEquals(4, resp.switchRounds());
                    assertEquals(3, resp.switchWins());
                    assertEquals(0.75, resp.switchWinRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalRounds());
                    assertEquals(0.0, resp.stayWinRate());
                    assertEquals(0.0, resp.switchWinRate());
                    assertEquals(0, resp.participantCount());
                    assertNotNull(resp.recentTrend());
                    assertEquals(7, resp.recentTrend().size());
                    // 空数据时 7 天趋势全为 0
                    resp.recentTrend().forEach(t -> {
                        assertEquals(0.0, t.stayRate());
                        assertEquals(0.0, t.switchRate());
                        assertEquals(0L, t.rounds());
                    });
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsTrendShouldAlwaysReturn7Days() {
        // 只有今天的数据
        long todayMillis = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC)
                .toInstant().toEpochMilli() + 3600_000;
        List<SwitchAnswerRound> rows = List.of(
                new SwitchAnswerRound(1L, "switch", true, 4, 2, "1.1.1.1", todayMillis),
                new SwitchAnswerRound(2L, "stay", false, 4, 2, "1.1.1.1", todayMillis)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(7, resp.recentTrend().size());
                    // 最后一天（今天）有数据
                    DailyTrend today = resp.recentTrend().get(6);
                    assertEquals(2L, today.rounds());
                    assertEquals(1.0, today.switchRate()); // 1 switch win / 1 switch total
                    assertEquals(0.0, today.stayRate());   // 0 stay wins / 1 stay total
                    // 其余天为 0
                    for (int i = 0; i < 6; i++) {
                        assertEquals(0L, resp.recentTrend().get(i).rounds());
                    }
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsParticipantCountShouldDeduplicateByDateAndIp() {
        long todayMillis = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC)
                .toInstant().toEpochMilli() + 3600_000;
        long yesterdayMillis = todayMillis - 86400_000;
        List<SwitchAnswerRound> rows = List.of(
                // 同一天同 IP 多次 → 算 1 人
                new SwitchAnswerRound(1L, "switch", true, 4, 2, "1.1.1.1", todayMillis),
                new SwitchAnswerRound(2L, "stay", false, 4, 2, "1.1.1.1", todayMillis),
                new SwitchAnswerRound(3L, "switch", true, 4, 2, "1.1.1.1", todayMillis),
                // 不同天同 IP → 算 2 人
                new SwitchAnswerRound(4L, "stay", true, 4, 2, "1.1.1.1", yesterdayMillis),
                // 同天不同 IP → 各算 1 人
                new SwitchAnswerRound(5L, "switch", true, 4, 2, "2.2.2.2", todayMillis)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    // 今天 1.1.1.1 → 1, 今天 2.2.2.2 → 1, 昨天 1.1.1.1 → 1 = 3
                    assertEquals(3, resp.participantCount());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsParticipantCountShouldHandleNullIp() {
        long todayMillis = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC)
                .toInstant().toEpochMilli() + 3600_000;
        List<SwitchAnswerRound> rows = List.of(
                new SwitchAnswerRound(1L, "switch", true, 4, 2, null, todayMillis),
                new SwitchAnswerRound(2L, "stay", false, 4, 2, null, todayMillis),
                new SwitchAnswerRound(3L, "switch", true, 4, 2, "1.1.1.1", todayMillis)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    // 今天 null → 1, 今天 1.1.1.1 → 1 = 2
                    assertEquals(2, resp.participantCount());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsAllSwitchWinsShouldShowCorrectRate() {
        List<SwitchAnswerRound> rows = List.of(
                mkRound("switch", true, "1.1.1.1"),
                mkRound("switch", true, "1.1.1.1"),
                mkRound("switch", true, "1.1.1.1"),
                mkRound("switch", true, "1.1.1.1")
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(4, resp.switchRounds());
                    assertEquals(4, resp.switchWins());
                    assertEquals(1.0, resp.switchWinRate());
                    assertEquals(0, resp.stayRounds());
                    assertEquals(0.0, resp.stayWinRate());
                })
                .verifyComplete();
    }

    // ─── helpers ───

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<SwitchAnswerRound> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(SwitchAnswerRound.class)).thenReturn(insertMock);
        when(insertMock.using(any(SwitchAnswerRound.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<SwitchAnswerRound> rows) {
        ReactiveSelectOperation.ReactiveSelect<SwitchAnswerRound> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(SwitchAnswerRound.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static SwitchAnswerRound mkRound(String strategy, boolean won, String ip) {
        return new SwitchAnswerRound(null, strategy, won, 4, 2, ip, System.currentTimeMillis());
    }
}
