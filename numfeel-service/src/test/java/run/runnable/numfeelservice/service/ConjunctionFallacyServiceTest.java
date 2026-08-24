package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.ConjunctionFallacyResult;
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

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConjunctionFallacyServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient db;

    @Mock
    private DatabaseClient.GenericExecuteSpec execSpec;

    private ConjunctionFallacyService service;

    @BeforeEach
    void setUp() {
        service = new ConjunctionFallacyService(template, db);
    }

    private static ConjunctionFallacyResult toResult(long id, int correct, String answers) {
        return new ConjunctionFallacyResult(id, "session-" + id, 10, correct, answers,
                System.currentTimeMillis());
    }

    /** 构造一个 mock Row，模拟 SQL 聚合结果。 */
    private static io.r2dbc.spi.Row mockRow(long totalSessions, double avgCorrect, long allCorrect,
                                            long[] conjCounts, long[] singleCounts) {
        io.r2dbc.spi.Row row = mock(io.r2dbc.spi.Row.class);
        when(row.get("total_sessions")).thenReturn(totalSessions);
        when(row.get("avg_correct")).thenReturn(BigDecimal.valueOf(avgCorrect));
        when(row.get("all_correct")).thenReturn(allCorrect);
        for (int q = 0; q < 10; q++) {
            when(row.get("q" + q + "_conj")).thenReturn(conjCounts[q]);
            when(row.get("q" + q + "_single")).thenReturn(singleCounts[q]);
        }
        return row;
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldInsertRecordThenReturnStats() {
        ReactiveInsertOperation.ReactiveInsert<ConjunctionFallacyResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(ConjunctionFallacyResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(ConjunctionFallacyResult.class))).thenReturn(Mono.empty());

        var expectedStats = new ConjunctionFallacyStatsResponse(
                1, 0.0, 0, 100.0,
                List.of(new ConjunctionFallacyQuestionRate(1, 1, 0, 1, 100.0, 0.0)));
        var fetchSpec = mock(RowsFetchSpec.class);
        when(db.sql(anyString())).thenReturn(execSpec);
        when(execSpec.map(any(java.util.function.BiFunction.class))).thenReturn(fetchSpec);
        when(fetchSpec.one()).thenReturn(Mono.just(expectedStats));

        StepVerifier.create(service.submit("s1", 10, 0, "[1,1,1,1,1,1,1,1,1,1]"))
                .assertNext(stats -> {
                    assertEquals(1, stats.totalSessions());
                    assertEquals(0.0, stats.avgCorrect());
                })
                .verifyComplete();

        verify(insertMock).using(argThat(e ->
                "s1".equals(e.sessionId())
                        && e.totalQuestions() == 10
                        && e.correctCount() == 0
                        && "[1,1,1,1,1,1,1,1,1,1]".equals(e.answers())));
    }

    @Test
    void statsShouldAggregatePerQuestionDistribution() {
        long[] conj = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
        long[] single = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
        io.r2dbc.spi.Row row = mockRow(2, 5.0, 1, conj, single);

        ConjunctionFallacyStatsResponse stats = ConjunctionFallacyService.buildStats(row);
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
    }

    @Test
    void statsOnEmptyTableReturnsZeroes() {
        io.r2dbc.spi.Row row = mock(io.r2dbc.spi.Row.class);
        when(row.get("total_sessions")).thenReturn(0L);

        ConjunctionFallacyStatsResponse stats = ConjunctionFallacyService.buildStats(row);
        assertEquals(0, stats.totalSessions());
        assertEquals(0, stats.avgCorrect());
        assertEquals(0, stats.allCorrectRate());
        assertEquals(0, stats.avgConjunctionRate());
        assertTrue(stats.perQuestion().isEmpty());
    }

    @Test
    void parseAnswersHandlesMalformedJson() {
        assertTrue(ConjunctionFallacyService.parseAnswers("").isEmpty());
        assertTrue(ConjunctionFallacyService.parseAnswers("{").isEmpty());
        assertTrue(ConjunctionFallacyService.parseAnswers("[a,b]").isEmpty());
    }

    @Test
    void parseAnswersRejectsWrongLength() {
        assertTrue(ConjunctionFallacyService.parseAnswers("[1,0]").isEmpty());
        assertTrue(ConjunctionFallacyService.parseAnswers("[1,0,1,0,1,0,1,0,1,0,1]").isEmpty());
    }

    @Test
    void parseAnswersAcceptsValidTenElements() {
        List<Integer> result = ConjunctionFallacyService.parseAnswers("[1,0,1,0,1,0,1,0,1,0]");
        assertEquals(10, result.size());
        assertEquals(1, result.get(0));
        assertEquals(0, result.get(9));
    }
}