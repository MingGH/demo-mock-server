package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.ConjunctionFallacyResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveInsertOperation;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConjunctionFallacyServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private ConjunctionFallacyService service;

    @BeforeEach
    void setUp() {
        service = new ConjunctionFallacyService(template);
    }

    private static ConjunctionFallacyResult toResult(long id, int correct, String answers) {
        return new ConjunctionFallacyResult(id, "session-" + id, 10, correct, answers,
                System.currentTimeMillis());
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecordThenReturnStats() {
        ReactiveInsertOperation.ReactiveInsert<ConjunctionFallacyResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        ReactiveSelectOperation.ReactiveSelect<ConjunctionFallacyResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.insert(ConjunctionFallacyResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(ConjunctionFallacyResult.class))).thenReturn(Mono.empty());
        when(template.select(ConjunctionFallacyResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(reactor.core.publisher.Flux.just(
                toResult(1, 2, "[1,0,1,0,1,0,1,0,1,0]")));

        StepVerifier.create(service.submit("s1", 10, 2, "[1,0,1,0,1,0,1,0,1,0]"))
                .assertNext(stats -> {
                    assertEquals(1, stats.totalSessions());
                    assertEquals(2.0, stats.avgCorrect());
                })
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.totalQuestions() == 10
                        && e.correctCount() == 2
                        && "[1,0,1,0,1,0,1,0,1,0]".equals(e.answers())));
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldAggregatePerQuestionDistribution() {
        ReactiveSelectOperation.ReactiveSelect<ConjunctionFallacyResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(ConjunctionFallacyResult.class)).thenReturn(selectMock);
        // 两人作答：一人全选合取项(1)，一人全选单项(0)
        when(selectMock.all()).thenReturn(reactor.core.publisher.Flux.just(
                toResult(1, 0, "[1,1,1,1,1,1,1,1,1,1]"),
                toResult(2, 10, "[0,0,0,0,0,0,0,0,0,0]")));

        StepVerifier.create(service.stats())
                .assertNext(stats -> {
                    assertEquals(2, stats.totalSessions());
                    assertEquals(5.0, stats.avgCorrect());
                    assertEquals(50.0, stats.allCorrectRate());
                    assertEquals(50.0, stats.avgConjunctionRate());
                    assertEquals(10, stats.perQuestion().size());
                    assertEquals(1, stats.perQuestion().get(0).questionId());
                    assertEquals(2, stats.perQuestion().get(0).total());
                    assertEquals(1, stats.perQuestion().get(0).singleCount());
                    assertEquals(1, stats.perQuestion().get(0).conjunctionCount());
                    assertEquals(50.0, stats.perQuestion().get(0).conjunctionRate());
                    assertEquals(50.0, stats.perQuestion().get(0).correctRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsOnEmptyTableReturnsZeroes() {
        ReactiveSelectOperation.ReactiveSelect<ConjunctionFallacyResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(ConjunctionFallacyResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(reactor.core.publisher.Flux.empty());

        StepVerifier.create(service.stats())
                .assertNext(stats -> {
                    assertEquals(0, stats.totalSessions());
                    assertEquals(0, stats.avgCorrect());
                    assertEquals(0, stats.allCorrectRate());
                    assertEquals(0, stats.avgConjunctionRate());
                    assertTrue(stats.perQuestion().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    void parseAnswersHandlesMalformedJson() {
        assertTrue(service.parseAnswers("").isEmpty());
        assertTrue(service.parseAnswers("{").isEmpty());
        assertTrue(service.parseAnswers("[a,b]").isEmpty());
    }
}
