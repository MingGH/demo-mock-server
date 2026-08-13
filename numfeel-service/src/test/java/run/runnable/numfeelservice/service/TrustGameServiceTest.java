package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.TrustGameResult;
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
class TrustGameServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private TrustGameService service;

    @BeforeEach
    void setUp() {
        service = new TrustGameService(template);
    }

    private static TrustGameResult toResult(long id, int invest, int ret, int earned, int order) {
        return new TrustGameResult(id, "s" + id, invest, ret, earned, order, System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecord() {
        ReactiveInsertOperation.ReactiveInsert<TrustGameResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(TrustGameResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(TrustGameResult.class))).thenReturn(Mono.empty());

        StepVerifier.create(service.submit("s1", 5, 6, 11, 0))
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.investAmount() == 5
                        && e.returnAmount() == 6
                        && e.totalEarned() == 11
                        && e.roleOrder() == 0));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<TrustGameResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(TrustGameResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(TrustGameResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        StepVerifier.create(service.submit("s1", 5, 6, 11, 0))
                .verifyError(RuntimeException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<TrustGameResult> rows = List.of(
                toResult(1L, 4, 6, 12, 0),
                toResult(2L, 6, 9, 15, 1),
                toResult(3L, 8, 12, 20, 0)
        );
        ReactiveSelectOperation.ReactiveSelect<TrustGameResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(TrustGameResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.totalSessions());
                    assertEquals(6.0, resp.avgInvest(), 0.01);
                    assertEquals(9.0, resp.avgReturn(), 0.01);
                    assertEquals(11, resp.investDistribution().size());
                    assertEquals(1L, resp.investDistribution().get(4));
                    assertEquals(1L, resp.investDistribution().get(6));
                    assertEquals(1L, resp.investDistribution().get(8));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<TrustGameResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(TrustGameResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.totalSessions());
                    assertEquals(0.0, resp.avgInvest());
                    assertEquals(0.0, resp.avgReturn());
                    assertTrue(resp.investDistribution().isEmpty());
                })
                .verifyComplete();
    }
}
