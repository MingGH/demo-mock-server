package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintCollectResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.BrowserFingerprintStatsResponse;
import run.runnable.numfeelservice.model.FingerprintRecord;
import run.runnable.numfeelservice.model.TrackingEntities.BrowserFingerprint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FingerprintServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient client;

    private FingerprintService service;

    private static final FingerprintRecord SAMPLE = FingerprintRecord.of(
            "hash123", "canvasHash", "fontHash", "webglHash",
            "1920x1080@24bit", "Asia/Shanghai", "zh-CN", "MacIntel",
            8, 8, true, 24, 2.0, 30.0, "1.2.3.4"
    );

    @BeforeEach
    void setUp() {
        service = new FingerprintService(template);
        when(template.getDatabaseClient()).thenReturn(client);
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectShouldReturnStatsFromDatabase() {
        mockInsertSuccess();
        BrowserFingerprintCollectResponse expected = new BrowserFingerprintCollectResponse(
                100, 5L, 1700000000000L, "mysql");
        mockSqlCollectResponse(expected);

        StepVerifier.create(service.collect(SAMPLE))
                .assertNext(resp -> {
                    assertEquals(100, resp.total());
                    assertEquals(5L, resp.sameHashCount());
                    assertEquals(1700000000000L, resp.lastSeenAt());
                    assertEquals("mysql", resp.source());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectShouldFallbackToMemoryWhenInsertFails() {
        ReactiveInsertOperation.ReactiveInsert<BrowserFingerprint> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BrowserFingerprint.class)).thenReturn(insertMock);
        when(insertMock.using(any(BrowserFingerprint.class)))
                .thenReturn(Mono.error(new RuntimeException("MySQL down")));
        mockSqlChain();

        StepVerifier.create(service.collect(SAMPLE))
                .assertNext(resp -> {
                    assertTrue(resp.total() >= 1);
                    assertNull(resp.sameHashCount());
                    assertNull(resp.lastSeenAt());
                    assertEquals("memory", resp.source());
                })
                .verifyComplete();

        StepVerifier.create(service.collect(SAMPLE))
                .assertNext(resp -> {
                    assertTrue(resp.total() >= 2);
                    assertEquals("memory", resp.source());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectShouldFallbackToMemoryWhenSqlQueryFails() {
        mockInsertSuccess();

        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("SELECT"))).thenReturn(spec);
        when(spec.bind(eq("full_hash"), any())).thenReturn(spec);

        RowsFetchSpec<BrowserFingerprintCollectResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.error(new RuntimeException("SQL error")));

        StepVerifier.create(service.collect(SAMPLE))
                .assertNext(resp -> {
                    assertTrue(resp.total() >= 1);
                    assertNull(resp.sameHashCount());
                    assertEquals("memory", resp.source());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void collectShouldHandleNullLastSeenAt() {
        mockInsertSuccess();
        BrowserFingerprintCollectResponse expected = new BrowserFingerprintCollectResponse(
                42, 1L, null, "mysql");
        mockSqlCollectResponse(expected);

        StepVerifier.create(service.collect(SAMPLE))
                .assertNext(resp -> {
                    assertEquals(42, resp.total());
                    assertEquals(1L, resp.sameHashCount());
                    assertNull(resp.lastSeenAt());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        BrowserFingerprintStatsResponse expected = new BrowserFingerprintStatsResponse(
                1000, 800, 1.25, 15, 40, 30, 20, 50, 5, 28.5);

        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("SELECT"))).thenReturn(spec);

        RowsFetchSpec<BrowserFingerprintStatsResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.just(expected));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1000, resp.total());
                    assertEquals(800, resp.uniqueFull());
                    assertEquals(1.25, resp.avgVisits());
                    assertEquals(15, resp.uniqueCanvas());
                    assertEquals(40, resp.uniqueFont());
                    assertEquals(30, resp.uniqueWebgl());
                    assertEquals(20, resp.uniqueTimezone());
                    assertEquals(50, resp.uniqueScreen());
                    assertEquals(5, resp.uniquePlatform());
                    assertEquals(28.5, resp.avgEntropy());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroStatsWhenTableIsEmpty() {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("SELECT"))).thenReturn(spec);

        RowsFetchSpec<BrowserFingerprintStatsResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.empty());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.uniqueFull());
                    assertEquals(0, resp.avgVisits());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleZeroUniqueFull() {
        BrowserFingerprintStatsResponse expected = new BrowserFingerprintStatsResponse(
                10, 0, 0.0, 5, 5, 5, 5, 5, 5, 3.0);

        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("SELECT"))).thenReturn(spec);

        RowsFetchSpec<BrowserFingerprintStatsResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.just(expected));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(10, resp.total());
                    assertEquals(0, resp.uniqueFull());
                    assertEquals(0.0, resp.avgVisits());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<BrowserFingerprint> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BrowserFingerprint.class)).thenReturn(insertMock);
        when(insertMock.using(any(BrowserFingerprint.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSqlCollectResponse(BrowserFingerprintCollectResponse expected) {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("SELECT"))).thenReturn(spec);
        when(spec.bind(eq("full_hash"), any())).thenReturn(spec);

        RowsFetchSpec<BrowserFingerprintCollectResponse> rowsSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
        when(rowsSpec.one()).thenReturn(Mono.just(expected));
    }

    @SuppressWarnings("unchecked")
    private void mockSqlChain() {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(anyString())).thenReturn(spec);
        when(spec.bind(anyString(), any())).thenReturn(spec);

        RowsFetchSpec<Object> rowsSpec = mock(RowsFetchSpec.class);
        when(rowsSpec.one()).thenReturn(Mono.empty());
        when(spec.map(any(BiFunction.class))).thenReturn(rowsSpec);
    }
}
