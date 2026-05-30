package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.InferenceLeaderboardSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InferenceLeaderboardTopResponse;
import run.runnable.numfeelservice.model.GameplayEntities.InferenceLeaderboardEntry;
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
class InferenceLeaderboardServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private InferenceLeaderboardService service;

    @BeforeEach
    void setUp() {
        service = new InferenceLeaderboardService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRank() {
        mockInsertSuccess();
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("Alice", 100, 10, 8, "A", 1000L),
                mkEntry("Bob", 80, 10, 6, "B", 2000L)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Charlie", 90, 10, 7, "A"))
                .assertNext(resp -> {
                    assertEquals("Charlie", resp.name());
                    assertEquals(90, resp.score());
                    assertEquals(10, resp.rounds());
                    assertEquals(7, resp.wins());
                    assertEquals("A", resp.grade());
                    assertEquals(2, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankOneForBestScore() {
        mockInsertSuccess();
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("Alice", 50, 5, 3, "C", 1000L)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Bob", 100, 10, 10, "S"))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnRankLastForLowestScore() {
        mockInsertSuccess();
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("Alice", 100, 10, 10, "S", 1000L)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.submit("Bob", 30, 3, 0, "D"))
                .assertNext(resp -> {
                    assertEquals(2, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleEmptyTable() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        StepVerifier.create(service.submit("Alice", 50, 5, 4, "B"))
                .assertNext(resp -> {
                    assertEquals(1, resp.rank());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void topShouldReturnSortedByScoreDescThenCreatedAt() {
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("Bob", 50, 5, 3, "C", 3000L),
                mkEntry("Alice", 50, 5, 4, "C", 1000L),
                mkEntry("Charlie", 30, 3, 1, "D", 2000L)
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
    void topShouldReturnAllWhenFewerThanLimit() {
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("Alice", 100, 10, 10, "S", 1000L)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.top(10))
                .assertNext(resp -> {
                    assertEquals(1, resp.leaders().size());
                    assertEquals(1, resp.total());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void topShouldReturnEmptyLeadersWhenTableEmpty() {
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
    void topShouldClampLimitToMinOne() {
        mockSelectAll(List.of());

        StepVerifier.create(service.top(0))
                .assertNext(resp -> {
                    assertTrue(resp.leaders().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void topShouldClampLimitToMaxFifty() {
        List<InferenceLeaderboardEntry> rows = new java.util.ArrayList<>();
        for (int i = 0; i < 60; i++) {
            rows.add(mkEntry("Player" + i, 100 - i, 10, i, "A", (long) i));
        }
        mockSelectAll(rows);

        StepVerifier.create(service.top(100))
                .assertNext(resp -> {
                    assertEquals(50, resp.leaders().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void topShouldReturnCorrectRanks() {
        List<InferenceLeaderboardEntry> rows = List.of(
                mkEntry("C", 30, 3, 1, "D", 3000L),
                mkEntry("B", 70, 7, 5, "B", 2000L),
                mkEntry("A", 100, 10, 9, "A", 1000L)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.top(3))
                .assertNext(resp -> {
                    assertEquals(3, resp.leaders().size());
                    assertEquals(1, resp.leaders().get(0).rank());
                    assertEquals(2, resp.leaders().get(1).rank());
                    assertEquals(3, resp.leaders().get(2).rank());
                    assertEquals("A", resp.leaders().get(0).name());
                    assertEquals("B", resp.leaders().get(1).name());
                    assertEquals("C", resp.leaders().get(2).name());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void clearShouldInvokeDeleteAll() {
        ReactiveDeleteOperation.ReactiveDelete deleteMock =
                mock(ReactiveDeleteOperation.ReactiveDelete.class);
        when(template.delete(InferenceLeaderboardEntry.class)).thenReturn(deleteMock);
        when(deleteMock.all()).thenReturn(Mono.empty());

        StepVerifier.create(service.clear())
                .verifyComplete();

        verify(deleteMock).all();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<InferenceLeaderboardEntry> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(InferenceLeaderboardEntry.class)).thenReturn(insertMock);
        when(insertMock.using(any(InferenceLeaderboardEntry.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<InferenceLeaderboardEntry> rows) {
        ReactiveSelectOperation.ReactiveSelect<InferenceLeaderboardEntry> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(InferenceLeaderboardEntry.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static InferenceLeaderboardEntry mkEntry(String name, int score, int rounds,
                                                      int wins, String grade, long createdAt) {
        return new InferenceLeaderboardEntry(null, name, score, rounds, wins, grade, createdAt);
    }
}
