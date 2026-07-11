package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.BrainComputeEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveDeleteOperation;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BrainComputeServiceTest {

    @Mock
    private R2dbcEntityTemplate template;
    @Mock
    private TurnstileVerifier turnstileVerifier;

    private BrainComputeService service;

    @BeforeEach
    void setUp() {
        service = new BrainComputeService(template, turnstileVerifier);
    }

    // ── 评分口径（与前端 logic.js 对齐）──
    @Test
    void computeScore_bestValues_max300() {
        assertEquals(300, service.computeScore(150, 400, 100));
    }

    @Test
    void computeScore_worstValues_zero() {
        assertEquals(0, service.computeScore(450, 3000, 0));
    }

    @Test
    void computeScore_beyondBest_stillCapped() {
        assertEquals(300, service.computeScore(80, 200, 100));
    }

    @Test
    void computeScore_beyondWorst_notNegative() {
        assertEquals(0, service.computeScore(9999, 99999, 0));
    }

    @Test
    void computeScore_fasterReactionScoresHigher() {
        assertTrue(service.computeScore(200, 1500, 50) > service.computeScore(400, 1500, 50));
    }

    @Test
    void gradeOf_boundaries() {
        assertEquals("神经反射级", service.gradeOf(260));
        assertEquals("身手不凡", service.gradeOf(259));
        assertEquals("身手不凡", service.gradeOf(200));
        assertEquals("训练有素", service.gradeOf(140));
        assertEquals("普通人类", service.gradeOf(80));
        assertEquals("还需练习", service.gradeOf(79));
    }

    // ── 提交流程 ──
    @Test
    @SuppressWarnings("unchecked")
    void submit_verifiesTurnstile_thenReturnsRank() {
        when(turnstileVerifier.verify(any(), any())).thenReturn(Mono.empty());
        mockInsertSuccess();
        // 已有两条记录，分数 300 和 100；本次 catMs/reaction/ball 使得分居中
        List<BrainComputeEntry> rows = List.of(
                mkEntry("Alice", 300, 150, 400, 100, 1000L),
                mkEntry("Bob", 100, 400, 2000, 30, 2000L)
        );
        mockSelectAll(rows);
        // reaction=300 -> 50, cat=1500 -> ~57.7, ball=50 -> 50，总分约 158
        StepVerifier.create(service.submit("Charlie", 300, 1500, 50, "tok", "1.2.3.4"))
                .assertNext(resp -> {
                    assertEquals("Charlie", resp.name());
                    assertEquals(service.computeScore(300, 1500, 50), resp.score());
                    assertEquals(service.gradeOf(resp.score()), resp.grade());
                    // 只有 Alice(300) 比它高
                    assertEquals(2, resp.rank());
                    assertEquals(2, resp.total());
                })
                .verifyComplete();
        verify(turnstileVerifier).verify("tok", "1.2.3.4");
    }

    @Test
    void submit_turnstileFailure_propagates_andSkipsInsert() {
        when(turnstileVerifier.verify(any(), any()))
                .thenReturn(Mono.error(new IllegalArgumentException("Turnstile verification failed")));
        StepVerifier.create(service.submit("Eve", 200, 1000, 90, "bad", "1.1.1.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && err.getMessage().contains("Turnstile"))
                .verify();
        verify(template, never()).insert(BrainComputeEntry.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submit_bestScore_rankOne() {
        when(turnstileVerifier.verify(any(), any())).thenReturn(Mono.empty());
        mockInsertSuccess();
        mockSelectAll(List.of(mkEntry("Alice", 100, 400, 2000, 30, 1000L)));
        StepVerifier.create(service.submit("Bob", 150, 400, 100, "tok", "ip"))
                .assertNext(resp -> assertEquals(1, resp.rank()))
                .verifyComplete();
    }

    // ── top 排序 ──
    @Test
    @SuppressWarnings("unchecked")
    void top_sortedByScoreDescThenCreatedAt() {
        List<BrainComputeEntry> rows = List.of(
                mkEntry("Bob", 200, 200, 500, 80, 3000L),
                mkEntry("Alice", 200, 200, 500, 80, 1000L),
                mkEntry("Charlie", 120, 300, 800, 40, 2000L)
        );
        mockSelectAll(rows);
        StepVerifier.create(service.top(2))
                .assertNext(resp -> {
                    assertEquals(2, resp.leaders().size());
                    assertEquals(3, resp.total());
                    assertEquals("Alice", resp.leaders().get(0).name());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals("Bob", resp.leaders().get(1).name());
                    assertEquals(2, resp.leaders().get(1).rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void top_emptyTable() {
        mockSelectAll(List.of());
        StepVerifier.create(service.top(5))
                .assertNext(resp -> {
                    assertTrue(resp.leaders().isEmpty());
                    assertEquals(0, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void top_clampLimitToMaxFifty() {
        List<BrainComputeEntry> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 60; i++) {
            rows.add(mkEntry("P" + i, 300 - i, 200, 500, 50, i));
        }
        mockSelectAll(rows);
        StepVerifier.create(service.top(100))
                .assertNext(resp -> assertEquals(50, resp.leaders().size()))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void clear_invokesDeleteAll() {
        ReactiveDeleteOperation.ReactiveDelete deleteMock =
                mock(ReactiveDeleteOperation.ReactiveDelete.class);
        when(template.delete(BrainComputeEntry.class)).thenReturn(deleteMock);
        when(deleteMock.all()).thenReturn(Mono.empty());
        StepVerifier.create(service.clear()).verifyComplete();
        verify(deleteMock).all();
    }

    // ── mock helpers ──
    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<BrainComputeEntry> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(BrainComputeEntry.class)).thenReturn(insertMock);
        when(insertMock.using(any(BrainComputeEntry.class))).thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<BrainComputeEntry> rows) {
        ReactiveSelectOperation.ReactiveSelect<BrainComputeEntry> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(BrainComputeEntry.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static BrainComputeEntry mkEntry(String name, int score, int reactionMs, int catMs,
                                             int ballScore, long createdAt) {
        return new BrainComputeEntry(null, name, score, reactionMs, catMs, ballScore, "x", createdAt);
    }
}
