package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.NewcombStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.NewcombResult;
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
class NewcombServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private NewcombService service;

    @BeforeEach
    void setUp() {
        service = new NewcombService(template);
    }

    @Test
    void isValidChoiceShouldReturnTrueForOne() {
        assertTrue(service.isValidChoice("one"));
    }

    @Test
    void isValidChoiceShouldReturnTrueForTwo() {
        assertTrue(service.isValidChoice("two"));
    }

    @Test
    void isValidChoiceShouldReturnFalseForNull() {
        assertFalse(service.isValidChoice(null));
    }

    @Test
    void isValidChoiceShouldReturnFalseForInvalidValue() {
        assertFalse(service.isValidChoice("three"));
        assertFalse(service.isValidChoice(""));
        assertFalse(service.isValidChoice("One"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnStats() {
        mockInsertSuccess();
        mockSelectAll(List.of());

        StepVerifier.create(service.submit("one", "one", true, 100))
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.oneBox());
                    assertEquals(0, resp.twoBox());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<NewcombResult> rows = List.of(
                mkResult("one", "one", true, 100),
                mkResult("one", "two", false, 0),
                mkResult("two", "one", false, 50),
                mkResult("two", "two", true, 120)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(4, resp.total());
                    assertEquals(2, resp.oneBox());
                    assertEquals(2, resp.twoBox());
                    assertEquals(2, resp.hits());
                    assertEquals(50.0, resp.hitRate());
                    assertEquals(50.0, resp.oneBoxPct());
                    assertEquals(50.0, resp.twoBoxPct());
                    assertEquals(50, resp.avgOnePayoff());
                    assertEquals(85, resp.avgTwoPayoff());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnZeroPercentagesWhenEmpty() {
        mockSelectAll(List.of());

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.total());
                    assertEquals(0, resp.oneBox());
                    assertEquals(0, resp.twoBox());
                    assertEquals(0, resp.hits());
                    assertEquals(0.0, resp.hitRate());
                    assertEquals(0.0, resp.oneBoxPct());
                    assertEquals(0.0, resp.twoBoxPct());
                    assertEquals(0, resp.avgOnePayoff());
                    assertEquals(0, resp.avgTwoPayoff());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleOnlyOneBoxChoices() {
        List<NewcombResult> rows = List.of(
                mkResult("one", "one", true, 100),
                mkResult("one", "one", true, 200),
                mkResult("one", "two", false, 0)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(3, resp.total());
                    assertEquals(3, resp.oneBox());
                    assertEquals(0, resp.twoBox());
                    assertEquals(2, resp.hits());
                    assertEquals(100.0, resp.oneBoxPct());
                    assertEquals(0.0, resp.twoBoxPct());
                    assertEquals(100, resp.avgOnePayoff());
                    assertEquals(0, resp.avgTwoPayoff());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleOnlyTwoBoxChoices() {
        List<NewcombResult> rows = List.of(
                mkResult("two", "one", false, 50),
                mkResult("two", "two", true, 120)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.total());
                    assertEquals(0, resp.oneBox());
                    assertEquals(2, resp.twoBox());
                    assertEquals(100.0, resp.twoBoxPct());
                    assertEquals(0.0, resp.oneBoxPct());
                    assertEquals(0, resp.avgOnePayoff());
                    assertEquals(85, resp.avgTwoPayoff());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldComputeHitRateCorrectly() {
        List<NewcombResult> rows = List.of(
                mkResult("one", "one", true, 100),
                mkResult("one", "two", true, 200),
                mkResult("two", "one", false, 50),
                mkResult("two", "two", false, 0),
                mkResult("two", "one", false, 30),
                mkResult("one", "one", true, 150),
                mkResult("one", "two", false, 0),
                mkResult("two", "two", true, 120),
                mkResult("one", "one", true, 100),
                mkResult("two", "one", false, 40)
        );
        mockSelectAll(rows);

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(10, resp.total());
                    assertEquals(5, resp.oneBox());
                    assertEquals(5, resp.twoBox());
                    assertEquals(5, resp.hits());
                    assertEquals(50.0, resp.hitRate());
                    assertEquals(50.0, resp.oneBoxPct());
                    assertEquals(50.0, resp.twoBoxPct());
                })
                .verifyComplete();
    }

    @SuppressWarnings("unchecked")
    private void mockInsertSuccess() {
        ReactiveInsertOperation.ReactiveInsert<NewcombResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(NewcombResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(NewcombResult.class)))
                .thenReturn(Mono.empty());
    }

    @SuppressWarnings("unchecked")
    private void mockSelectAll(List<NewcombResult> rows) {
        ReactiveSelectOperation.ReactiveSelect<NewcombResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(NewcombResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));
    }

    private static NewcombResult mkResult(String choice, String prediction, boolean hit, int payoff) {
        return new NewcombResult(null, choice, prediction, hit, payoff, System.currentTimeMillis());
    }
}
