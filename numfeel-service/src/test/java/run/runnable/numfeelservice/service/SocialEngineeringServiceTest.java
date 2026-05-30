package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringStatsResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringSubmitResponse;
import run.runnable.numfeelservice.model.SocialEngineeringRecord;
import run.runnable.numfeelservice.model.SocialEngineeringRecord.QuestionResult;
import run.runnable.numfeelservice.model.TrackingEntities.SocialEngineeringQuestion;
import run.runnable.numfeelservice.model.TrackingEntities.SocialEngineeringSession;
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

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SocialEngineeringServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private SocialEngineeringService service;

    @BeforeEach
    void setUp() {
        service = new SocialEngineeringService(template);
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnOkTrue() {
        mockInsertSessionSuccess();
        mockInsertQuestionSuccess();

        SocialEngineeringRecord record = mkRecord("session-1", 5, 4, List.of(
                mkQuestionResult(1, "phishing", true, true),
                mkQuestionResult(2, "pretexting", false, true),
                mkQuestionResult(3, "phishing", true, false)
        ));

        StepVerifier.create(service.submit(record))
                .assertNext(resp -> assertTrue(resp.ok()))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnOkTrueForPerfectScore() {
        mockInsertSessionSuccess();
        mockInsertQuestionSuccess();

        SocialEngineeringRecord record = mkRecord("session-2", 3, 3, List.of(
                mkQuestionResult(1, "phishing", true, true),
                mkQuestionResult(2, "pretexting", false, true),
                mkQuestionResult(3, "phishing", false, true)
        ));

        StepVerifier.create(service.submit(record))
                .assertNext(resp -> assertTrue(resp.ok()))
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        mockInsertSessionSuccess();
        ReactiveInsertOperation.ReactiveInsert<SocialEngineeringQuestion> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(SocialEngineeringQuestion.class)).thenReturn(insertMock);
        when(insertMock.using(any(SocialEngineeringQuestion.class)))
                .thenReturn(Mono.error(new RuntimeException("db error")));

        SocialEngineeringRecord record = mkRecord("session-3", 2, 1, List.of(
                mkQuestionResult(1, "phishing", true, false)
        ));

        StepVerifier.create(service.submit(record))
                .expectError(RuntimeException.class)
                .verify();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<SocialEngineeringSession> sessions = List.of(
                mkSession("s1", 5, 5, true),
                mkSession("s2", 5, 3, false)
        );
        mockSelectAllSessions(sessions);

        List<SocialEngineeringQuestion> questions = List.of(
                mkQuestion("s1", 1, "phishing", true, true),
                mkQuestion("s1", 2, "pretexting", false, true),
                mkQuestion("s2", 1, "phishing", true, false),
                mkQuestion("s2", 2, "pretexting", false, true)
        );
        mockSelectAllQuestions(questions);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.global().totalSessions());
                    assertEquals(1, resp.global().perfectSessions());
                    assertEquals(8, resp.global().totalCorrectAnswers());
                    assertEquals(2, resp.global().totalWrongAnswers());
                    assertEquals(80.0, resp.global().avgScorePct());
                    assertEquals(2, resp.questions().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnQuestionStatsGroupedByIdAndTactic() {
        List<SocialEngineeringSession> sessions = List.of(
                mkSession("s1", 2, 1, false)
        );
        mockSelectAllSessions(sessions);

        List<SocialEngineeringQuestion> questions = List.of(
                mkQuestion("s1", 1, "phishing", true, true),
                mkQuestion("s1", 2, "pretexting", false, false),
                mkQuestion("s1", 1, "phishing", true, false),
                mkQuestion("s1", 2, "pretexting", false, true)
        );
        mockSelectAllQuestions(questions);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.questions().size());
                    assertEquals(1, resp.questions().get(0).questionId());
                    assertEquals("phishing", resp.questions().get(0).tactic());
                    assertEquals(2, resp.questions().get(0).attempts());
                    assertEquals(1, resp.questions().get(0).correctCount());
                    assertEquals(1, resp.questions().get(0).wrongCount());
                    assertEquals(50.0, resp.questions().get(0).correctRate());

                    assertEquals(2, resp.questions().get(1).questionId());
                    assertEquals("pretexting", resp.questions().get(1).tactic());
                    assertEquals(2, resp.questions().get(1).attempts());
                    assertEquals(1, resp.questions().get(1).correctCount());
                    assertEquals(1, resp.questions().get(1).wrongCount());
                    assertEquals(50.0, resp.questions().get(1).correctRate());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZerosWhenEmpty() {
        mockSelectAllSessions(List.of());
        mockSelectAllQuestions(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.global().totalSessions());
                    assertEquals(0, resp.global().perfectSessions());
                    assertEquals(0, resp.global().totalCorrectAnswers());
                    assertEquals(0, resp.global().totalWrongAnswers());
                    assertEquals(0.0, resp.global().avgScorePct());
                    assertTrue(resp.questions().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldSortQuestionsByQuestionId() {
        List<SocialEngineeringSession> sessions = List.of(
                mkSession("s1", 3, 2, false)
        );
        mockSelectAllSessions(sessions);

        List<SocialEngineeringQuestion> questions = List.of(
                mkQuestion("s1", 3, "baiting", false, true),
                mkQuestion("s1", 1, "phishing", true, false),
                mkQuestion("s1", 2, "pretexting", false, true),
                mkQuestion("s1", 1, "phishing", false, true)
        );
        mockSelectAllQuestions(questions);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.questions().size());
                    assertEquals(1, resp.questions().get(0).questionId());
                    assertEquals(2, resp.questions().get(1).questionId());
                    assertEquals(3, resp.questions().get(2).questionId());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleMultipleSessionsWithSameQuestion() {
        List<SocialEngineeringSession> sessions = List.of(
                mkSession("s1", 2, 2, true),
                mkSession("s2", 2, 1, false),
                mkSession("s3", 2, 0, false)
        );
        mockSelectAllSessions(sessions);

        List<SocialEngineeringQuestion> questions = List.of(
                mkQuestion("s1", 1, "phishing", true, true),
                mkQuestion("s1", 2, "phishing", false, true),
                mkQuestion("s2", 1, "phishing", true, false),
                mkQuestion("s2", 2, "phishing", true, true),
                mkQuestion("s3", 1, "phishing", true, false),
                mkQuestion("s3", 2, "phishing", false, false)
        );
        mockSelectAllQuestions(questions);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.global().totalSessions());
                    assertEquals(1, resp.global().perfectSessions());
                    assertEquals(3, resp.global().totalCorrectAnswers());
                    assertEquals(3, resp.global().totalWrongAnswers());
                    assertEquals(50.0, resp.global().avgScorePct());
                    assertEquals(2, resp.questions().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnFullCorrectRateForAllCorrectQuestions() {
        List<SocialEngineeringSession> sessions = List.of(
                mkSession("s1", 1, 1, true)
        );
        mockSelectAllSessions(sessions);

        List<SocialEngineeringQuestion> questions = List.of(
                mkQuestion("s1", 1, "phishing", true, true),
                mkQuestion("s1", 1, "phishing", false, true),
                mkQuestion("s1", 1, "phishing", true, true)
        );
        mockSelectAllQuestions(questions);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(1, resp.questions().size());
                    assertEquals(3, resp.questions().get(0).attempts());
                    assertEquals(3, resp.questions().get(0).correctCount());
                    assertEquals(0, resp.questions().get(0).wrongCount());
                    assertEquals(100.0, resp.questions().get(0).correctRate());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSessionSuccess() {
        ReactiveInsertOperation.ReactiveInsert<SocialEngineeringSession> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(SocialEngineeringSession.class)).thenReturn(insertMock);
        when(insertMock.using(any(SocialEngineeringSession.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockInsertQuestionSuccess() {
        ReactiveInsertOperation.ReactiveInsert<SocialEngineeringQuestion> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(SocialEngineeringQuestion.class)).thenReturn(insertMock);
        when(insertMock.using(any(SocialEngineeringQuestion.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAllSessions(List<SocialEngineeringSession> rows) {
        ReactiveSelectOperation.ReactiveSelect<SocialEngineeringSession> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(SocialEngineeringSession.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAllQuestions(List<SocialEngineeringQuestion> rows) {
        ReactiveSelectOperation.ReactiveSelect<SocialEngineeringQuestion> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(SocialEngineeringQuestion.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static SocialEngineeringRecord mkRecord(String sessionId, int total, int correct,
                                                     List<QuestionResult> questions) {
        return new SocialEngineeringRecord(sessionId, total, correct, questions);
    }

    private static QuestionResult mkQuestionResult(int questionId, String tactic,
                                                    boolean isFake, boolean correct) {
        return new QuestionResult(questionId, tactic, isFake, correct);
    }

    private static SocialEngineeringSession mkSession(String sessionId, int total, int correct, boolean allCorrect) {
        return new SocialEngineeringSession(null, sessionId, total, correct, allCorrect,
                System.currentTimeMillis());
    }

    private static SocialEngineeringQuestion mkQuestion(String sessionId, int questionId,
                                                         String tactic, boolean isFake, boolean correct) {
        return new SocialEngineeringQuestion(null, sessionId, questionId, tactic, isFake, correct,
                System.currentTimeMillis());
    }
}
