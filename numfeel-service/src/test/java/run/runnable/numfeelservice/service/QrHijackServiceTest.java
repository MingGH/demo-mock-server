package run.runnable.numfeelservice.service;

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
import run.runnable.numfeelservice.model.QrHijackEntities.QrHijackSession;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QrHijackServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private QrHijackService service;

    @BeforeEach
    void setUp() {
        service = new QrHijackService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void createSessionShouldReturnTokenAndTtl() {
        mockInsertSuccess();

        StepVerifier.create(service.createSession())
                .assertNext(result -> {
                    assertNotNull(result.get("token"));
                    assertEquals(16, ((String) result.get("token")).length());
                    assertNotNull(result.get("expiresAt"));
                    assertEquals(120L, result.get("ttlSeconds"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void pollSessionShouldReturnExpiredForUnknownToken() {
        StepVerifier.create(service.pollSession("nonexistent"))
                .assertNext(result -> assertEquals("expired", result.get("status")))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void pollSessionShouldReturnPendingAfterCreate() {
        mockInsertSuccess();

        service.createSession().block();
        // 获取创建时缓存的 token（通过再创建一次来测试轮询逻辑）
        Map<String, Object> created = service.createSession().block();
        assertNotNull(created);
        String token = (String) created.get("token");

        StepVerifier.create(service.pollSession(token))
                .assertNext(result -> {
                    assertEquals("pending", result.get("status"));
                    assertTrue(((long) result.get("remainMs")) > 0);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void scanShouldReturnFailureForUnknownToken() {
        StepVerifier.create(service.scan("unknown-token", "Mozilla"))
                .assertNext(result -> assertFalse((Boolean) result.get("success")))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void scanShouldSucceedAndUpdateStatus() {
        mockInsertSuccess();
        mockSelectAllForScan("test-token-123456");

        Map<String, Object> created = service.createSession().block();
        assertNotNull(created);
        String token = (String) created.get("token");

        // Mock selectAll to return the session for update
        mockSelectAllForScan(token);
        mockUpdateSuccess();

        StepVerifier.create(service.scan(token, "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)"))
                .assertNext(result -> {
                    assertTrue((Boolean) result.get("success"));
                    assertEquals("iPhone", result.get("device"));
                })
                .verifyComplete();

        // After scan, polling should return scanned
        StepVerifier.create(service.pollSession(token))
                .assertNext(result -> {
                    assertEquals("scanned", result.get("status"));
                    assertEquals("iPhone", result.get("scannedBy"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void scanShouldRejectDuplicateScan() {
        mockInsertSuccess();

        Map<String, Object> created = service.createSession().block();
        assertNotNull(created);
        String token = (String) created.get("token");

        mockSelectAllForScan(token);
        mockUpdateSuccess();

        // First scan
        service.scan(token, "Android").block();

        // Second scan should fail
        StepVerifier.create(service.scan(token, "iPhone"))
                .assertNext(result -> assertFalse((Boolean) result.get("success")))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<QrHijackSession> sessions = List.of(
                new QrHijackSession(1L, "token1", "scanned", "iPhone", 1000L, 2000L, true),
                new QrHijackSession(2L, "token2", "pending", "", 1000L, 0L, false),
                new QrHijackSession(3L, "token3", "scanned", "Android", 1000L, 3000L, true)
        );
        mockSelectAll(sessions);

        StepVerifier.create(service.stats())
                .assertNext(result -> {
                    assertEquals(3L, result.get("totalSessions"));
                    assertEquals(2L, result.get("scannedCount"));
                    assertEquals(66.7, result.get("hijackRate"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZerosWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(result -> {
                    assertEquals(0L, result.get("totalSessions"));
                    assertEquals(0L, result.get("scannedCount"));
                    assertEquals(0.0, result.get("hijackRate"));
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<QrHijackSession> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        lenient().when(template.insert(QrHijackSession.class)).thenReturn(insertMock);
        lenient().when(insertMock.using(any(QrHijackSession.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<QrHijackSession> rows) {
        ReactiveSelectOperation.ReactiveSelect<QrHijackSession> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(QrHijackSession.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAllForScan(String token) {
        QrHijackSession session = new QrHijackSession(
                1L, token, "pending", "", System.currentTimeMillis(), 0L, false);
        ReactiveSelectOperation.ReactiveSelect<QrHijackSession> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        lenient().when(template.select(QrHijackSession.class)).thenReturn(selectMock);
        lenient().when(selectMock.all()).thenReturn(Flux.just(session));
    }

    @SuppressWarnings("unchecked")
    private void mockUpdateSuccess() {
        lenient().when(template.update(any(QrHijackSession.class)))
                .thenReturn(Mono.empty());
    }
}
