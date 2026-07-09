package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.GrepVsSqliteService;
import run.runnable.numfeelservice.service.GrepVsSqliteService.*;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * GrepVsSqliteController HTTP 层测试。
 * Mock service，验证状态码、参数校验、响应结构。
 */
class GrepVsSqliteControllerTest {

    private GrepVsSqliteService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(GrepVsSqliteService.class);
        client = WebTestClient.bindToController(new GrepVsSqliteController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    // ============= GET /grep-vs-sqlite/status =============

    @Test
    void status_returns_data() {
        when(mockService.status())
                .thenReturn(Mono.just(new StatusResult(100000, 15_000_000L, 20_000_000L, true)));

        client.get().uri("/grep-vs-sqlite/status")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.messageCount").isEqualTo(100000)
                .jsonPath("$.data.fileSizeBytes").isEqualTo(15000000)
                .jsonPath("$.data.dbSizeBytes").isEqualTo(20000000)
                .jsonPath("$.data.ready").isEqualTo(true);
    }

    @Test
    void status_service_error_returns_500() {
        when(mockService.status())
                .thenReturn(Mono.error(new RuntimeException("IO error")));

        client.get().uri("/grep-vs-sqlite/status")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    // ============= POST /grep-vs-sqlite/search =============

    @Test
    void search_returns_comparison() {
        SearchResult mockResult = new SearchResult(
                82.5, 3.2, 150, 150,
                List.of("消息1", "消息2"), List.of("消息1", "消息2"));
        when(mockService.search("火锅"))
                .thenReturn(Mono.just(mockResult));

        client.post().uri("/grep-vs-sqlite/search")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"keyword\":\"火锅\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.grepTimeMs").isEqualTo(82.5)
                .jsonPath("$.data.sqliteTimeMs").isEqualTo(3.2)
                .jsonPath("$.data.grepMatchCount").isEqualTo(150)
                .jsonPath("$.data.sqliteMatchCount").isEqualTo(150);
    }

    @Test
    void search_missing_keyword_returns_400() {
        client.post().uri("/grep-vs-sqlite/search")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void search_blank_keyword_returns_400() {
        client.post().uri("/grep-vs-sqlite/search")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"keyword\":\"\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void search_keyword_too_long_returns_400() {
        String longKeyword = "a".repeat(51);
        client.post().uri("/grep-vs-sqlite/search")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"keyword\":\"" + longKeyword + "\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    // ============= POST /grep-vs-sqlite/insert =============

    @Test
    void insert_returns_timing() {
        when(mockService.insert("测试消息", "张三"))
                .thenReturn(Mono.just(new InsertResult(0.05, 1.2, 100001)));

        client.post().uri("/grep-vs-sqlite/insert")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"content\":\"测试消息\",\"sender\":\"张三\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.fileAppendTimeMs").isEqualTo(0.05)
                .jsonPath("$.data.sqliteInsertTimeMs").isEqualTo(1.2)
                .jsonPath("$.data.totalMessages").isEqualTo(100001);
    }

    @Test
    void insert_missing_content_returns_400() {
        client.post().uri("/grep-vs-sqlite/insert")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"sender\":\"张三\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void insert_default_sender() {
        when(mockService.insert(eq("内容"), eq("匿名用户")))
                .thenReturn(Mono.just(new InsertResult(0.01, 0.5, 100001)));

        client.post().uri("/grep-vs-sqlite/insert")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"content\":\"内容\"}")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void insert_content_too_long_returns_400() {
        String longContent = "x".repeat(501);
        client.post().uri("/grep-vs-sqlite/insert")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"content\":\"" + longContent + "\"}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    // ============= POST /grep-vs-sqlite/complex-query =============

    @Test
    void complexQuery_returns_comparison() {
        when(mockService.complexQuery("image", 7))
                .thenReturn(Mono.just(new ComplexQueryResult(120.0, 2.5, 500, 500, "image", 7)));

        client.post().uri("/grep-vs-sqlite/complex-query")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"type\":\"image\",\"recentDays\":7}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.grepTimeMs").isEqualTo(120.0)
                .jsonPath("$.data.sqliteTimeMs").isEqualTo(2.5)
                .jsonPath("$.data.filterType").isEqualTo("image")
                .jsonPath("$.data.filterDays").isEqualTo(7);
    }

    @Test
    void complexQuery_missing_type_returns_400() {
        client.post().uri("/grep-vs-sqlite/complex-query")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"recentDays\":7}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void complexQuery_days_out_of_range_returns_400() {
        client.post().uri("/grep-vs-sqlite/complex-query")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"type\":\"text\",\"recentDays\":0}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void complexQuery_days_too_high_returns_400() {
        client.post().uri("/grep-vs-sqlite/complex-query")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"type\":\"text\",\"recentDays\":366}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    // ============= POST /grep-vs-sqlite/delete =============

    @Test
    void delete_returns_comparison() {
        when(mockService.delete("快递"))
                .thenReturn(Mono.just(new DeleteResult(250.0, 5.0, 30, 30)));

        client.post().uri("/grep-vs-sqlite/delete")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"keyword\":\"快递\"}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.fileRewriteTimeMs").isEqualTo(250.0)
                .jsonPath("$.data.sqliteDeleteTimeMs").isEqualTo(5.0)
                .jsonPath("$.data.fileDeletedCount").isEqualTo(30)
                .jsonPath("$.data.sqliteDeletedCount").isEqualTo(30);
    }

    @Test
    void delete_missing_keyword_returns_400() {
        client.post().uri("/grep-vs-sqlite/delete")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    // ============= POST /grep-vs-sqlite/reinit =============

    @Test
    void reinit_valid() {
        when(mockService.reinit(50000))
                .thenReturn(Mono.just(new StatusResult(50000, 7_000_000L, 10_000_000L, true)));

        client.post().uri("/grep-vs-sqlite/reinit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"count\":50000}")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.messageCount").isEqualTo(50000);
    }

    @Test
    void reinit_count_too_low_returns_400() {
        client.post().uri("/grep-vs-sqlite/reinit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"count\":500}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void reinit_count_too_high_returns_400() {
        client.post().uri("/grep-vs-sqlite/reinit")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"count\":2000000}")
                .exchange()
                .expectStatus().isEqualTo(400);
    }
}
