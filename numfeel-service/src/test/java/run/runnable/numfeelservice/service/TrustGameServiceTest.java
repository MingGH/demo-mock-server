package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.TrustGameResult;
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
class TrustGameServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient db;

    private TrustGameService service;

    @BeforeEach
    void setUp() {
        service = new TrustGameService(template, db);
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
    void aggregateStatsShouldReturnFullDistribution() {
        List<long[]> distRows = List.of(new long[]{4, 1}, new long[]{6, 2});
        var resp = TrustGameService.aggregateStats(3, 6.0, 9.0, distRows);
        assertEquals(3, resp.totalSessions());
        assertEquals(6.0, resp.avgInvest(), 0.01);
        assertEquals(9.0, resp.avgReturn(), 0.01);
        assertEquals(11, resp.investDistribution().size());
        assertEquals(1L, resp.investDistribution().get(4));
        assertEquals(2L, resp.investDistribution().get(6));
        assertEquals(0L, resp.investDistribution().get(0));
        assertEquals(0L, resp.investDistribution().get(10));
    }

    @Test
    void aggregateStatsShouldHandleEmptyData() {
        var resp = TrustGameService.aggregateStats(0, 0.0, 0.0, Collections.emptyList());
        assertEquals(0, resp.totalSessions());
        assertEquals(0.0, resp.avgInvest());
        assertEquals(0.0, resp.avgReturn());
        assertEquals(11, resp.investDistribution().size());
        for (int i = 0; i <= 10; i++) {
            assertEquals(0L, resp.investDistribution().get(i));
        }
    }
}
