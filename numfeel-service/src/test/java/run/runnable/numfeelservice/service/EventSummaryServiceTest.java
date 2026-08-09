package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.AbstractMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EventSummaryServiceTest {

    @Mock
    private DatabaseClient databaseClient;

    private EventSummaryService service;

    @BeforeEach
    void setUp() {
        service = new EventSummaryService(databaseClient);
    }

    @Test
    @SuppressWarnings("unchecked")
    void summary_aggregatesCountsAndByEventGrouping() {
        DatabaseClient.GenericExecuteSpec countsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec byEventSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(databaseClient.sql(contains("COUNT(*) AS events"))).thenReturn(countsSpec);
        when(databaseClient.sql(contains("GROUP BY event_name"))).thenReturn(byEventSpec);
        when(countsSpec.bind(eq(0), eq("wealth-button-paradox"))).thenReturn(countsSpec);
        when(byEventSpec.bind(eq(0), eq("wealth-button-paradox"))).thenReturn(byEventSpec);

        RowsFetchSpec<long[]> countsRows = mock(RowsFetchSpec.class);
        when(countsSpec.map(any(BiFunction.class))).thenReturn(countsRows);
        when(countsRows.one()).thenReturn(Mono.just(new long[]{100L, 20L}));

        RowsFetchSpec<Map.Entry<String, Long>> byEventRows = mock(RowsFetchSpec.class);
        when(byEventSpec.map(any(BiFunction.class))).thenReturn(byEventRows);
        when(byEventRows.all()).thenReturn(Flux.fromIterable(List.of(
                new AbstractMap.SimpleEntry<>("press", 80L),
                new AbstractMap.SimpleEntry<>("bankrupt", 20L)
        )));

        StepVerifier.create(service.summary("wealth-button-paradox"))
                .assertNext(resp -> {
                    assertEquals(20, resp.sessions());
                    assertEquals(100, resp.events());
                    assertEquals(80L, resp.byEvent().get("press"));
                    assertEquals(20L, resp.byEvent().get("bankrupt"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void summary_emptyResult_returnsZeros() {
        DatabaseClient.GenericExecuteSpec countsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec byEventSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(databaseClient.sql(contains("COUNT(*) AS events"))).thenReturn(countsSpec);
        when(databaseClient.sql(contains("GROUP BY event_name"))).thenReturn(byEventSpec);
        when(countsSpec.bind(eq(0), any())).thenReturn(countsSpec);
        when(byEventSpec.bind(eq(0), any())).thenReturn(byEventSpec);

        RowsFetchSpec<long[]> countsRows = mock(RowsFetchSpec.class);
        when(countsSpec.map(any(BiFunction.class))).thenReturn(countsRows);
        when(countsRows.one()).thenReturn(Mono.empty());

        RowsFetchSpec<Map.Entry<String, Long>> byEventRows = mock(RowsFetchSpec.class);
        when(byEventSpec.map(any(BiFunction.class))).thenReturn(byEventRows);
        when(byEventRows.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.summary("no-data-demo"))
                .assertNext(resp -> {
                    assertEquals(0, resp.sessions());
                    assertEquals(0, resp.events());
                    assertTrue(resp.byEvent().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void summary_calledTwice_queriesDatabaseEachTimeWithoutCache() {
        // Without Spring proxy, @Cacheable does not apply — both calls hit the DB.
        // Caching behavior is verified via integration test with Spring context.
        DatabaseClient.GenericExecuteSpec countsSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        DatabaseClient.GenericExecuteSpec byEventSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(databaseClient.sql(contains("COUNT(*) AS events"))).thenReturn(countsSpec);
        when(databaseClient.sql(contains("GROUP BY event_name"))).thenReturn(byEventSpec);
        when(countsSpec.bind(eq(0), any())).thenReturn(countsSpec);
        when(byEventSpec.bind(eq(0), any())).thenReturn(byEventSpec);

        RowsFetchSpec<long[]> countsRows = mock(RowsFetchSpec.class);
        when(countsSpec.map(any(BiFunction.class))).thenReturn(countsRows);
        when(countsRows.one()).thenReturn(Mono.just(new long[]{5L, 2L}));

        RowsFetchSpec<Map.Entry<String, Long>> byEventRows = mock(RowsFetchSpec.class);
        when(byEventSpec.map(any(BiFunction.class))).thenReturn(byEventRows);
        when(byEventRows.all()).thenReturn(Flux.fromIterable(List.of(
                new AbstractMap.SimpleEntry<>("press", 5L)
        )));

        service.summary("cached-demo").block();
        service.summary("cached-demo").block();

        // Without Spring proxy both calls reach the database
        verify(databaseClient, times(2)).sql(contains("COUNT(*) AS events"));
    }
}
