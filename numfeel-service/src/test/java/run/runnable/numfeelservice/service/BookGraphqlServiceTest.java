package run.runnable.numfeelservice.service;

import graphql.schema.DataFetchingEnvironment;
import graphql.schema.DataFetchingFieldSelectionSet;
import graphql.schema.SelectedField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import io.r2dbc.spi.Row;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.web.ApiException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * BookGraphqlService 单元测试。
 * <p>
 * 核心验证点：selection set 决定真实 DB 成本——
 * 只请求标量 1 次调用；追加 author 变 1+N；再追加 reviews 变 1+N+N。
 * 这是"GraphQL 服务端成本随客户端嵌套深度失控"的直接证据。
 */
@ExtendWith(MockitoExtension.class)
class BookGraphqlServiceTest {

    @Mock
    private DatabaseClient db;

    @Mock
    private BookStoreDataInitializer dataInitializer;

    private BookGraphqlService service;

    @BeforeEach
    void setUp() {
        service = new BookGraphqlService(db, dataInitializer);
        lenient().when(dataInitializer.isReady()).thenReturn(true);
    }

    @Test
    void queryShouldReturn503WhenNotReady() {
        when(dataInitializer.isReady()).thenReturn(false);
        DataFetchingEnvironment env = mockEnv(false, false);

        StepVerifier.create(service.query(env, 3))
                .expectErrorSatisfies(e -> {
                    assertInstanceOf(ApiException.class, e);
                    assertEquals(503, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    void scalarOnlyShouldCostSingleDbCall() {
        stubFlux("ORDER BY b.rating DESC", bookTable(3));
        DataFetchingEnvironment env = mockEnv(false, false);

        StepVerifier.create(service.query(env, 3))
                .assertNext(result -> {
                    assertEquals(1, result.meta().dbCalls());
                    assertEquals(3, result.meta().rowsLoaded());
                    assertEquals(3, result.books().size());
                    assertNull(result.books().get(0).author());
                    assertTrue(result.books().get(0).reviews().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    void withAuthorShouldCostOnePlusN() {
        stubFlux("ORDER BY b.rating DESC", bookTable(3));
        stubOne("bookstore_authors WHERE id", authorTable());
        DataFetchingEnvironment env = mockEnv(true, false);

        StepVerifier.create(service.query(env, 3))
                .assertNext(result -> {
                    assertEquals(4, result.meta().dbCalls());
                    assertEquals(6, result.meta().rowsLoaded());
                    assertEquals("霍金", result.books().get(0).author().name());
                })
                .verifyComplete();
    }

    @Test
    void withAuthorAndReviewsShouldExplodeCost() {
        stubFlux("ORDER BY b.rating DESC", bookTable(3));
        stubOne("bookstore_authors WHERE id", authorTable());
        // 每本书 2 条书评：rowsLoaded = 3 books + 3 authors + 6 reviews
        stubFlux("bookstore_reviews WHERE book_id", reviewTable(2));
        DataFetchingEnvironment env = mockEnv(true, true);

        StepVerifier.create(service.query(env, 3))
                .assertNext(result -> {
                    assertEquals(7, result.meta().dbCalls());
                    assertEquals(12, result.meta().rowsLoaded());
                    assertEquals(2, result.books().get(0).reviews().size());
                })
                .verifyComplete();
    }

    @Test
    void limitShouldBeClampedToMax() {
        ArgumentCaptor<Object> bound = ArgumentCaptor.forClass(Object.class);
        DatabaseClient.GenericExecuteSpec spec = stubFlux("ORDER BY b.rating DESC", bookTable(1));
        when(spec.bind(eq("limit"), bound.capture())).thenReturn(spec);
        DataFetchingEnvironment env = mockEnv(false, false);

        StepVerifier.create(service.query(env, 9999))
                .assertNext(result -> assertEquals(1, result.books().size()))
                .verifyComplete();

        assertEquals(100, bound.getValue(), "limit=9999 应被钳制为 100");
    }

    // ── stub 帮助方法 ──

    /**
     * 按 SQL 片段 stub 一个多行查询：捕获 map 映射函数，用模拟行数据驱动它产生结果。
     *
     * @return spec mock（供调用方追加断言）
     */
    @SuppressWarnings("unchecked")
    private DatabaseClient.GenericExecuteSpec stubFlux(String fragment, List<Map<String, Object>> table) {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains(fragment))).thenReturn(spec);
        lenient().when(spec.bind(anyString(), any())).thenReturn(spec);

        RowsFetchSpec<Object> rows = mock(RowsFetchSpec.class);
        BiFunction[] fn = new BiFunction[1];
        when(spec.map(any(BiFunction.class))).thenAnswer(inv -> {
            fn[0] = inv.getArgument(0);
            return rows;
        });
        when(rows.all()).thenAnswer(inv -> {
            List<Object> mapped = new ArrayList<>();
            for (Map<String, Object> data : table) {
                mapped.add(fn[0].apply(mockRow(data), null));
            }
            return Flux.fromIterable(mapped);
        });
        return spec;
    }

    /** 按 SQL 片段 stub 一个单行查询（.one()）。 */
    @SuppressWarnings("unchecked")
    private void stubOne(String fragment, Map<String, Object> row) {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains(fragment))).thenReturn(spec);
        lenient().when(spec.bind(anyString(), any())).thenReturn(spec);

        RowsFetchSpec<Object> rows = mock(RowsFetchSpec.class);
        BiFunction[] fn = new BiFunction[1];
        when(spec.map(any(BiFunction.class))).thenAnswer(inv -> {
            fn[0] = inv.getArgument(0);
            return rows;
        });
        when(rows.one()).thenAnswer(inv ->
                Mono.just(fn[0].apply(mockRow(row), null)));
    }

    /** 构造 mock Row：按列名取值。 */
    @SuppressWarnings("unchecked")
    private Row mockRow(Map<String, Object> data) {
        Row row = mock(Row.class);
        when(row.get(anyString())).thenAnswer(inv -> data.get(inv.getArgument(0, String.class)));
        when(row.get(anyString(), any())).thenAnswer(inv -> {
            Object v = data.get(inv.getArgument(0, String.class));
            return v == null ? null : v.toString();
        });
        return row;
    }

    /** 构造 mock DataFetchingEnvironment：指定 author/reviews 是否被请求。 */
    private DataFetchingEnvironment mockEnv(boolean withAuthor, boolean withReviews) {
        DataFetchingEnvironment env = mock(DataFetchingEnvironment.class);

        DataFetchingFieldSelectionSet inner = mock(DataFetchingFieldSelectionSet.class);
        lenient().when(inner.contains("author")).thenReturn(withAuthor);
        lenient().when(inner.contains("reviews")).thenReturn(withReviews);

        SelectedField booksField = mock(SelectedField.class);
        lenient().when(booksField.getSelectionSet()).thenReturn(inner);

        DataFetchingFieldSelectionSet outer = mock(DataFetchingFieldSelectionSet.class);
        lenient().when(outer.getFields("books")).thenReturn(List.of(booksField));
        lenient().when(env.getSelectionSet()).thenReturn(outer);
        return env;
    }

    /** 构造 n 本书的基础行数据。 */
    private List<Map<String, Object>> bookTable(int n) {
        List<Map<String, Object>> table = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", i);
            r.put("title", "书" + i);
            r.put("author_id", 100 + i);
            r.put("isbn", "9787" + i);
            r.put("category", "科普");
            r.put("price", 45.0 + i);
            r.put("rating", 4.5);
            r.put("pages", 300);
            r.put("stock", 20);
            r.put("published_year", 2020);
            r.put("description", "这是第 " + i + " 本书的简介，比较长。");
            table.add(r);
        }
        return table;
    }

    /** 构造作者行数据。 */
    private Map<String, Object> authorTable() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", 101);
        r.put("name", "霍金");
        r.put("country", "英国");
        r.put("bio", "理论物理学家。");
        return r;
    }

    /** 构造 n 条书评行数据。 */
    private List<Map<String, Object>> reviewTable(int n) {
        List<Map<String, Object>> table = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", 9000 + i);
            r.put("rating", 5);
            r.put("content", "好书 " + i);
            r.put("reviewer", "读者" + i);
            table.add(r);
        }
        return table;
    }
}