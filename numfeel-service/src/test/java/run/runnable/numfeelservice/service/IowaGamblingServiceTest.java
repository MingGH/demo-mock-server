package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingResult;
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
class IowaGamblingServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private IowaGamblingService service;

    @BeforeEach
    void setUp() {
        service = new IowaGamblingService(template);
    }

    private static IowaGamblingResult toResult(long id, int totalRounds, int finalMoney, int netScore,
                                               boolean bankrupt, String deckPicks, String blockScores) {
        return new IowaGamblingResult(id, "session-" + id, totalRounds, finalMoney, netScore,
                bankrupt, deckPicks, blockScores, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecord() {
        ReactiveInsertOperation.ReactiveInsert<IowaGamblingResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("s1", 100, 3000, 10, false,
                        "[25,25,25,25]", "[2,-4,6,10,8]"))
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.totalRounds() == 100
                        && e.finalMoney() == 3000
                        && e.netScore() == 10
                        && !e.bankrupt()
                        && "[25,25,25,25]".equals(e.deckPicks())
                        && "[2,-4,6,10,8]".equals(e.blockScores())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<IowaGamblingResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(IowaGamblingResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(IowaGamblingResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        StepVerifier.create(service.submit("s1", 100, 3000, 10, false,
                        "[25,25,25,25]", "[2,-4,6,10,8]"))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<IowaGamblingResult> rows = List.of(
                toResult(1L, 100, 2500, 6, false, "[20,20,30,30]", "[0,0,4,4,4]"),
                toResult(2L, 100, 1500, -2, false, "[30,30,20,20]", "[-4,-2,0,2,2]"),
                toResult(3L, 62, -800, -20, true, "[40,30,10,20]", "[-10,-10]")
        );

        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.totalSessions());
                    assertEquals(-5.3, resp.avgNetScore(), 0.01);
                    assertEquals(1066.7, resp.avgFinalMoney(), 0.1);
                    assertEquals(0.33, resp.bankruptRate(), 0.01);
                    assertEquals(4, resp.avgDeckPicks().size());
                    assertEquals(30.0, resp.avgDeckPicks().get(0), 0.01);
                    assertEquals(26.7, resp.avgDeckPicks().get(1), 0.1);
                    assertEquals(5, resp.avgBlockScores().size());
                    assertEquals(-4.7, resp.avgBlockScores().get(0), 0.01);
                    assertEquals(-4.0, resp.avgBlockScores().get(1), 0.01);
                    assertEquals(2.0, resp.avgBlockScores().get(2), 0.01);
                    assertEquals(3.0, resp.avgBlockScores().get(3), 0.01);
                    assertEquals(3.0, resp.avgBlockScores().get(4), 0.01);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalSessions());
                    assertEquals(0.0, resp.avgNetScore());
                    assertEquals(0.0, resp.avgFinalMoney());
                    assertEquals(0.0, resp.bankruptRate());
                    assertTrue(resp.avgDeckPicks().isEmpty());
                    assertTrue(resp.avgBlockScores().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyJsonArrays() {
        // deckPicks/blockScores 为合法但空的 JSON 数组（[]）不应导致越界异常
        List<IowaGamblingResult> rows = List.of(
                toResult(1L, 100, 2500, 6, false, "[]", "[]"),
                toResult(2L, 100, 1500, -2, false, "[]", "[]")
        );

        ReactiveSelectOperation.ReactiveSelect<IowaGamblingResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(IowaGamblingResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.totalSessions());
                    assertEquals(0.0, resp.avgDeckPicks().get(0));
                    assertTrue(resp.avgBlockScores().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    void parseJsonArrayShouldHandleValidJson() {
        List<Integer> result = IowaGamblingService.parseJsonArray("[1,2,3,4]", 4);
        assertEquals(List.of(1, 2, 3, 4), result);
    }

    @Test
    void parseJsonArrayShouldHandleMalformedJson() {
        List<Integer> result = IowaGamblingService.parseJsonArray("not-json", 4);
        assertEquals(List.of(0, 0, 0, 0), result);
    }
}
