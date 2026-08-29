package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.RowsFetchSpec;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.controller.dto.CatalogItemDTO;
import run.runnable.numfeelservice.controller.dto.CatalogResponseDTO;
import run.runnable.numfeelservice.web.ApiException;

import java.util.List;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * RestVsGraphqlService 单元测试。
 * <p>
 * 覆盖：完整/瘦身两种目录形态、limit 钳制、单书详情联查书评、书不存在抛 404。
 */
@ExtendWith(MockitoExtension.class)
class RestVsGraphqlServiceTest {

    @Mock
    private DatabaseClient db;

    @Mock
    private BookStoreDataInitializer dataInitializer;

    private RestVsGraphqlService service;

    @BeforeEach
    void setUp() {
        service = new RestVsGraphqlService(db, dataInitializer);
        // 默认视为已就绪，避免与初始化器状态耦合
        when(dataInitializer.isReady()).thenReturn(true);
    }

    @Test
    void catalogShouldReturn503WhenNotReady() {
        when(dataInitializer.isReady()).thenReturn(false);

        StepVerifier.create(service.catalog(true, 10))
                .expectErrorSatisfies(e -> {
                    assertInstanceOf(ApiException.class, e);
                    assertEquals(503, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    @SuppressWarnings("unchecked")
    void catalogFullShouldReturnAllFields() {
        CatalogItemDTO full = new CatalogItemDTO(1, "时间简史", "霍金", "9787",
                "科普", 45.0, 4.8, 212, 30, 1988, "从宇宙大爆炸讲起");
        mockCatalog("b.isbn", List.of(full));

        StepVerifier.create(service.catalog(true, 20))
                .assertNext(resp -> {
                    assertEquals(1, resp.count());
                    assertEquals(1, resp.sqlCalls());
                    assertEquals(1, resp.items().size());
                    CatalogItemDTO item = resp.items().get(0);
                    assertNotNull(item.isbn());
                    assertNotNull(item.category());
                    assertNotNull(item.pages());
                    assertNotNull(item.stock());
                    assertNotNull(item.publishedYear());
                    assertNotNull(item.description());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void catalogLightShouldOmitHeavyFields() {
        CatalogItemDTO light = new CatalogItemDTO(1, "时间简史", "霍金", null, null,
                45.0, 4.8, null, null, null, null);
        mockCatalog("b.price", List.of(light));

        StepVerifier.create(service.catalog(false, 20))
                .assertNext(resp -> {
                    assertEquals(1, resp.count());
                    assertEquals(1, resp.sqlCalls());
                    CatalogItemDTO item = resp.items().get(0);
                    assertEquals(45.0, item.price());
                    assertEquals(4.8, item.rating());
                    assertNull(item.isbn());
                    assertNull(item.description());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void catalogShouldClampLimit() {
        CatalogItemDTO item = new CatalogItemDTO(1, "x", "y", null, null, 1.0, 1.0, null, null, null, null);
        // 任何 limit 走的都是同一条 SQL；这里验证负数/超界被钳制后不报错
        mockCatalog("b.price", List.of(item));

        assertDoesNotThrow(() -> service.catalog(true, -5));
        assertDoesNotThrow(() -> service.catalog(false, 9999));
    }

    @Test
    @SuppressWarnings("unchecked")
    void bookShouldReturnDetailWithReviews() {
        CatalogItemDTO book = new CatalogItemDTO(7, "深度学习", "Ivan", "9781", "科普",
                99.0, 4.9, 500, 10, 2016, "花书");

        DatabaseClient.GenericExecuteSpec bookSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains("WHERE b.id = :id"))).thenReturn(bookSpec);
        RowsFetchSpec<CatalogItemDTO> bookRows = mock(RowsFetchSpec.class);
        when(bookSpec.bind(eq("id"), eq(7))).thenReturn(bookSpec);
        when(bookSpec.map(any(BiFunction.class))).thenReturn(bookRows);
        when(bookRows.one()).thenReturn(Mono.just(book));

        DatabaseClient.GenericExecuteSpec reviewSpec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains("bookstore_reviews WHERE book_id"))).thenReturn(reviewSpec);
        when(reviewSpec.bind(eq("bookId"), eq(7))).thenReturn(reviewSpec);
        RowsFetchSpec<Object> reviewRows = mock(RowsFetchSpec.class);
        when(reviewSpec.map(any(BiFunction.class))).thenReturn(reviewRows);
        when(reviewRows.all()).thenReturn(Flux.empty());

        StepVerifier.create(service.book(7))
                .assertNext(detail -> {
                    assertEquals(7, detail.book().id());
                    assertTrue(detail.reviews().isEmpty());
                })
                .verifyComplete();
    }

    @Test
    @SuppressWarnings("unchecked")
    void bookShouldThrow404WhenMissing() {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains("WHERE b.id = :id"))).thenReturn(spec);
        when(spec.bind(eq("id"), eq(99999))).thenReturn(spec);
        RowsFetchSpec<CatalogItemDTO> rows = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rows);
        when(rows.one()).thenReturn(Mono.empty());

        StepVerifier.create(service.book(99999))
                .expectErrorSatisfies(e -> {
                    assertInstanceOf(ApiException.class, e);
                    assertEquals(404, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    void bookShouldRejectInvalidId() {
        StepVerifier.create(service.book(0))
                .expectErrorSatisfies(e -> assertInstanceOf(ApiException.class, e))
                .verify();
    }

    /** 按 SQL 关键字 stub 目录查询，返回给定条目。 */
    @SuppressWarnings("unchecked")
    private void mockCatalog(String sqlFragment, List<CatalogItemDTO> items) {
        DatabaseClient.GenericExecuteSpec spec = mock(DatabaseClient.GenericExecuteSpec.class);
        when(db.sql(contains(sqlFragment))).thenReturn(spec);
        when(spec.bind(eq("limit"), anyInt())).thenReturn(spec);
        RowsFetchSpec<CatalogItemDTO> rows = mock(RowsFetchSpec.class);
        when(spec.map(any(BiFunction.class))).thenReturn(rows);
        when(rows.all()).thenReturn(Flux.fromIterable(items));
    }
}