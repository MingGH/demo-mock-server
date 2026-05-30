package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.DevilDealResult;
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

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DevilDealServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    private DevilDealService service;

    @BeforeEach
    void setUp() {
        service = new DevilDealService(template);
    }

    private static DevilDealResult toResult(long id, String dealType, String secondType,
                                             int powerPct, int lovePct, int moneyPct,
                                             int revengePct, int recognitionPct, int knowledgePct) {
        return new DevilDealResult(id, dealType, secondType, powerPct, lovePct, moneyPct,
                revengePct, recognitionPct, knowledgePct, System.currentTimeMillis());
    }

    @Test
    void isValidTypeShouldReturnTrueForValidType() {
        assertTrue(service.isValidType("power"));
        assertTrue(service.isValidType("love"));
        assertTrue(service.isValidType("money"));
        assertTrue(service.isValidType("revenge"));
        assertTrue(service.isValidType("recognition"));
        assertTrue(service.isValidType("knowledge"));
    }

    @Test
    void isValidTypeShouldReturnFalseForInvalidType() {
        assertFalse(service.isValidType("invalid"));
        assertFalse(service.isValidType("health"));
        assertFalse(service.isValidType(""));
    }

    @Test
    void isValidTypeShouldReturnFalseForNull() {
        assertFalse(service.isValidType(null));
    }

    @Test
    void isValidPctShouldReturnTrueForValidPercentage() {
        assertTrue(service.isValidPct(0));
        assertTrue(service.isValidPct(50));
        assertTrue(service.isValidPct(100));
    }

    @Test
    void isValidPctShouldReturnFalseForInvalidPercentage() {
        assertFalse(service.isValidPct(-1));
        assertFalse(service.isValidPct(101));
    }

    @Test
    void isValidPctShouldReturnFalseForNull() {
        assertFalse(service.isValidPct(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldReturnSubmitResponse() {
        ReactiveInsertOperation.ReactiveInsert<DevilDealResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(DevilDealResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(DevilDealResult.class))).thenReturn(Mono.empty());

        List<DevilDealResult> rows = List.of(
                toResult(1L, "power", "love", 30, 20, 10, 5, 15, 20),
                toResult(2L, "money", "power", 25, 15, 30, 10, 10, 10),
                toResult(3L, "power", "knowledge", 35, 10, 10, 15, 10, 20)
        );

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("power", "love", 30, 20, 10, 5, 15, 20))
                .assertNext(resp -> {
                    assertTrue(resp.sameCount() >= 1);
                    assertEquals(3, resp.total());
                    assertTrue(resp.samePercent() > 0);
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitAgainstEmptyDatasetShouldReturnZeroSameCount() {
        ReactiveInsertOperation.ReactiveInsert<DevilDealResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(DevilDealResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(DevilDealResult.class))).thenReturn(Mono.empty());

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.submit("power", "love", 30, 20, 10, 5, 15, 20))
                .assertNext(resp -> {
                    assertEquals(0, resp.sameCount());
                    assertEquals(0, resp.total());
                    assertEquals(0.0, resp.samePercent());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldCalculateSameCountCorrectly() {
        ReactiveInsertOperation.ReactiveInsert<DevilDealResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(DevilDealResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(DevilDealResult.class))).thenReturn(Mono.empty());

        List<DevilDealResult> rows = List.of(
                toResult(1L, "power", "love", 40, 10, 10, 10, 20, 10),
                toResult(2L, "power", "money", 50, 10, 10, 10, 10, 10),
                toResult(3L, "love", "power", 20, 40, 10, 10, 10, 10),
                toResult(4L, "power", "revenge", 30, 15, 20, 15, 10, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("power", "knowledge", 35, 15, 15, 10, 15, 10))
                .assertNext(resp -> {
                    assertEquals(3, resp.sameCount());
                    assertEquals(4, resp.total());
                    assertEquals(75.0, resp.samePercent());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldReturnAggregatedData() {
        List<DevilDealResult> rows = List.of(
                toResult(1L, "power", "love", 30, 20, 10, 5, 15, 20),
                toResult(2L, "money", "power", 25, 15, 30, 10, 10, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(2, resp.global().totalSessions());
                    assertEquals(27.5, resp.global().avgPower());
                    assertEquals(17.5, resp.global().avgLove());
                    assertEquals(20.0, resp.global().avgMoney());
                    assertEquals(7.5, resp.global().avgRevenge());
                    assertEquals(12.5, resp.global().avgRecognition());
                    assertEquals(15.0, resp.global().avgKnowledge());
                    assertNotNull(resp.typeDist());
                    assertEquals(2, resp.typeDist().size());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldHandleEmptyData() {
        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(Collections.emptyList()));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertEquals(0, resp.global().totalSessions());
                    assertEquals(0.0, resp.global().avgPower());
                    assertEquals(0.0, resp.global().avgLove());
                    assertEquals(0.0, resp.global().avgMoney());
                    assertEquals(0.0, resp.global().avgRevenge());
                    assertEquals(0.0, resp.global().avgRecognition());
                    assertEquals(0.0, resp.global().avgKnowledge());
                    assertTrue(resp.typeDist().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void statsShouldIncludeTypeDistribution() {
        List<DevilDealResult> rows = List.of(
                toResult(1L, "power", "love", 40, 10, 10, 10, 20, 10),
                toResult(2L, "power", "money", 50, 10, 10, 10, 10, 10),
                toResult(3L, "love", "power", 20, 40, 10, 10, 10, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.stats())
                .assertNext(resp -> {
                    assertTrue(resp.typeDist().containsKey("power"));
                    assertTrue(resp.typeDist().containsKey("love"));
                    assertEquals(2L, resp.typeDist().get("power"));
                    assertEquals(1L, resp.typeDist().get("love"));
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldHandleUniqueDealType() {
        ReactiveInsertOperation.ReactiveInsert<DevilDealResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(DevilDealResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(DevilDealResult.class))).thenReturn(Mono.empty());

        List<DevilDealResult> rows = List.of(
                toResult(1L, "power", "love", 30, 20, 10, 5, 15, 20),
                toResult(2L, "money", "power", 25, 15, 30, 10, 10, 10)
        );

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.fromIterable(rows));

        StepVerifier.create(service.submit("knowledge", "power", 10, 15, 20, 25, 20, 10))
                .assertNext(resp -> {
                    assertEquals(0, resp.sameCount());
                    assertEquals(2, resp.total());
                    assertEquals(0.0, resp.samePercent());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void submitShouldPropagateInsertError() {
        ReactiveInsertOperation.ReactiveInsert<DevilDealResult> insertMock =
                mock(ReactiveInsertOperation.ReactiveInsert.class);
        when(template.insert(DevilDealResult.class)).thenReturn(insertMock);
        when(insertMock.using(any(DevilDealResult.class)))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        ReactiveSelectOperation.ReactiveSelect<DevilDealResult> selectMock =
                mock(ReactiveSelectOperation.ReactiveSelect.class);
        when(template.select(DevilDealResult.class)).thenReturn(selectMock);
        when(selectMock.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.submit("power", "love", 30, 20, 10, 5, 15, 20))
                .verifyError(RuntimeException.class);
    }
}
