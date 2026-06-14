package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.GooseDuckQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.GooseDuckStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.GooseDuckResult;
import org.junit.jupiter.api.Test;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.data.r2dbc.core.ReactiveSelectOperation;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * GooseDuckService 纯逻辑测试。
 */
class GooseDuckServiceTest {

    @Test
    void stats_empty_returns_zero() {
        R2dbcEntityTemplate mockTemplate = mock(R2dbcEntityTemplate.class);
        ReactiveSelectOperation.ReactiveSelect mockSelect = mock(ReactiveSelectOperation.ReactiveSelect.class);
        ReactiveSelectOperation.TerminatingSelect mockTerminating = mock(ReactiveSelectOperation.TerminatingSelect.class);

        when(mockTemplate.select(GooseDuckResult.class)).thenReturn(mockSelect);
        when(mockSelect.all()).thenReturn(Flux.empty());

        GooseDuckService service = new GooseDuckService(mockTemplate);

        StepVerifier.create(service.stats())
                .assertNext(stats -> {
                    assertEquals(0, stats.totalPlayers());
                    assertEquals(0, stats.avgScore());
                    assertEquals(0, stats.avgAccuracy());
                    assertTrue(stats.perQuestion().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    void stats_with_data_computes_correctly() {
        R2dbcEntityTemplate mockTemplate = mock(R2dbcEntityTemplate.class);
        ReactiveSelectOperation.ReactiveSelect mockSelect = mock(ReactiveSelectOperation.ReactiveSelect.class);

        String answersJson1 = "[{\"questionId\":1,\"choice\":\"duck\",\"correct\":true},{\"questionId\":2,\"choice\":\"goose\",\"correct\":true},{\"questionId\":3,\"choice\":\"goose\",\"correct\":false},{\"questionId\":4,\"choice\":\"goose\",\"correct\":true},{\"questionId\":5,\"choice\":\"duck\",\"correct\":true},{\"questionId\":6,\"choice\":\"goose\",\"correct\":true},{\"questionId\":7,\"choice\":\"duck\",\"correct\":true},{\"questionId\":8,\"choice\":\"duck\",\"correct\":false},{\"questionId\":9,\"choice\":\"duck\",\"correct\":true},{\"questionId\":10,\"choice\":\"goose\",\"correct\":true}]";
        String answersJson2 = "[{\"questionId\":1,\"choice\":\"goose\",\"correct\":false},{\"questionId\":2,\"choice\":\"goose\",\"correct\":true},{\"questionId\":3,\"choice\":\"duck\",\"correct\":true},{\"questionId\":4,\"choice\":\"duck\",\"correct\":false},{\"questionId\":5,\"choice\":\"duck\",\"correct\":true},{\"questionId\":6,\"choice\":\"duck\",\"correct\":false},{\"questionId\":7,\"choice\":\"duck\",\"correct\":true},{\"questionId\":8,\"choice\":\"goose\",\"correct\":true},{\"questionId\":9,\"choice\":\"goose\",\"correct\":false},{\"questionId\":10,\"choice\":\"goose\",\"correct\":true}]";

        GooseDuckResult row1 = new GooseDuckResult(1L, 8, 10, answersJson1, System.currentTimeMillis());
        GooseDuckResult row2 = new GooseDuckResult(2L, 6, 10, answersJson2, System.currentTimeMillis());

        when(mockTemplate.select(GooseDuckResult.class)).thenReturn(mockSelect);
        when(mockSelect.all()).thenReturn(Flux.just(row1, row2));

        GooseDuckService service = new GooseDuckService(mockTemplate);

        StepVerifier.create(service.stats())
                .assertNext(stats -> {
                    assertEquals(2, stats.totalPlayers());
                    assertEquals(7.0, stats.avgScore(), 0.01);
                    assertEquals(0.7, stats.avgAccuracy(), 0.01);
                    assertEquals(10, stats.perQuestion().size());

                    // Question 1: row1 correct, row2 wrong => 50%
                    GooseDuckQuestionRate q1 = stats.perQuestion().get(0);
                    assertEquals(1, q1.questionId());
                    assertEquals(0.5, q1.correctRate(), 0.01);

                    // Question 2: both correct => 100%
                    GooseDuckQuestionRate q2 = stats.perQuestion().get(1);
                    assertEquals(2, q2.questionId());
                    assertEquals(1.0, q2.correctRate(), 0.01);
                })
                .verifyComplete();
    }

    @Test
    void stats_with_invalid_json_ignores_parsing_errors() {
        R2dbcEntityTemplate mockTemplate = mock(R2dbcEntityTemplate.class);
        ReactiveSelectOperation.ReactiveSelect mockSelect = mock(ReactiveSelectOperation.ReactiveSelect.class);

        GooseDuckResult row = new GooseDuckResult(1L, 5, 10, "invalid json", System.currentTimeMillis());

        when(mockTemplate.select(GooseDuckResult.class)).thenReturn(mockSelect);
        when(mockSelect.all()).thenReturn(Flux.just(row));

        GooseDuckService service = new GooseDuckService(mockTemplate);

        StepVerifier.create(service.stats())
                .assertNext(stats -> {
                    assertEquals(1, stats.totalPlayers());
                    assertEquals(5.0, stats.avgScore(), 0.01);
                    // perQuestion should have 0 rates since JSON parsing failed
                    assertEquals(10, stats.perQuestion().size());
                    for (GooseDuckQuestionRate q : stats.perQuestion()) {
                        assertEquals(0.0, q.correctRate(), 0.01);
                    }
                })
                .verifyComplete();
    }
}
