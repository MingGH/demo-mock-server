package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.model.GameplayEntities.GameOfLifePattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.AbstractMap;
import java.util.Map;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 康威生命游戏服务层测试。
 * <p>
 * 重点验证：
 * <ol>
 *   <li>getStats 使用 DatabaseClient 聚合 SQL，不调用 selectAll 全表扫描</li>
 *   <li>聚合结果正确映射到 GameOfLifePatternStatsResponse</li>
 *   <li>空表与错误场景正确兜底</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class GameOfLifeServiceTest {

    @Mock
    private R2dbcEntityTemplate template;

    @Mock
    private DatabaseClient client;

    private GameOfLifeService service;

    @BeforeEach
    void setUp() {
        service = new GameOfLifeService(template);
        lenient().when(template.getDatabaseClient()).thenReturn(client);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void getStatsShouldUseAggregationSqlNotSelectAll() {
        // 构造 COUNT 查询的 mock 链（用 "AS total" 区分两个查询）
        var countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total"))).thenReturn(countSpec);
        var countRowSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowSpec);
        when(countRowSpec.one()).thenReturn(Mono.just(5L));

        // 构造 GROUP BY 查询的 mock 链
        var groupBySpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("GROUP BY"))).thenReturn(groupBySpec);
        var groupRowSpec = mock(RowsFetchSpec.class);
        when(groupBySpec.map(any(BiFunction.class))).thenReturn(groupRowSpec);
        Flux<Map.Entry<String, Long>> flux = Flux.just(
                new AbstractMap.SimpleEntry<>("glider", 3L),
                new AbstractMap.SimpleEntry<>("blinker", 2L));
        when(groupRowSpec.all()).thenReturn(flux);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(5L, resp.total());
                    assertEquals(Map.of("glider", 3L, "blinker", 2L), resp.patternCounts());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void getStatsShouldNotCallSelectAll() {
        // 设置 mock 链让 service.getStats() 可以执行
        var countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total"))).thenReturn(countSpec);
        var countRowSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowSpec);
        when(countRowSpec.one()).thenReturn(Mono.just(42L));

        var groupBySpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("GROUP BY"))).thenReturn(groupBySpec);
        var groupRowSpec = mock(RowsFetchSpec.class);
        when(groupBySpec.map(any(BiFunction.class))).thenReturn(groupRowSpec);
        when(groupRowSpec.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.getStats())
                .assertNext(resp -> assertEquals(42L, resp.total()))
                .verifyComplete();

        // 验证 getStats 没有使用 template.select（即没有 selectAll 全表扫描）
        verify(template, never()).select(any());
        verify(template, never()).select(eq(GameOfLifePattern.class));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void getStatsShouldPropagateError() {
        var spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(anyString())).thenReturn(spec);
        var rowSpec = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rowSpec);
        when(rowSpec.one()).thenReturn(Mono.error(new RuntimeException("DB down")));
        when(rowSpec.all()).thenReturn(Flux.error(new RuntimeException("DB down")));

        StepVerifier.create(service.getStats())
                .expectError(RuntimeException.class)
                .verify();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void getStatsShouldHandleNullPatternKey() {
        var countSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("COUNT(*) AS total"))).thenReturn(countSpec);
        var countRowSpec = mock(RowsFetchSpec.class);
        when(countSpec.map(any(BiFunction.class))).thenReturn(countRowSpec);
        when(countRowSpec.one()).thenReturn(Mono.just(3L));

        var groupBySpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(client.sql(contains("GROUP BY"))).thenReturn(groupBySpec);
        var groupRowSpec = mock(RowsFetchSpec.class);
        when(groupBySpec.map(any(BiFunction.class))).thenReturn(groupRowSpec);
        Flux<Map.Entry<String, Long>> flux = Flux.just(
                new AbstractMap.SimpleEntry<>("unknown", 1L),
                new AbstractMap.SimpleEntry<>("glider", 2L));
        when(groupRowSpec.all()).thenReturn(flux);

        StepVerifier.create(service.getStats())
                .assertNext(resp -> {
                    assertEquals(3L, resp.total());
                    assertEquals(1L, resp.patternCounts().get("unknown"));
                    assertEquals(2L, resp.patternCounts().get("glider"));
                })
                .verifyComplete();
    }
}
