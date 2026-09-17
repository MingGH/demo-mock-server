package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.SqliteRagLabService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SqliteRagLabController HTTP 层测试：standalone WebTestClient + mock service，
 * 只验证状态码/参数校验/响应信封，不依赖真实 SQLite。
 */
class SqliteRagLabControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SqliteRagLabService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(SqliteRagLabService.class);
        client = WebTestClient.bindToController(new SqliteRagLabController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void info_ok() {
        when(mockService.info()).thenReturn(Mono.just(java.util.Map.of("sqliteVersion", "3.50.0")));
        client.get().uri("/sqlite-rag/info")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.sqliteVersion").isEqualTo("3.50.0");
    }

    @Test
    void ask_requires_query() {
        client.post().uri("/sqlite-rag/ask")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(MAPPER.valueToTree(java.util.Map.of()))
                .exchange()
                .expectStatus().isBadRequest();
        verify(mockService, never()).ask(anyString());
    }

    @Test
    void ask_rejects_overlong_query() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("query", "问".repeat(101));
        client.post().uri("/sqlite-rag/ask")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void ask_ok_wrapped_in_envelope() {
        when(mockService.ask("混合检索")).thenReturn(Mono.just(java.util.Map.of("query", "混合检索")));
        ObjectNode body = MAPPER.createObjectNode();
        body.put("query", "混合检索");
        client.post().uri("/sqlite-rag/ask")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.query").isEqualTo("混合检索");
    }

    @Test
    void battle_requires_query() {
        client.post().uri("/sqlite-rag/battle")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void ingest_rejects_short_text() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("title", "x");
        body.put("text", "太短了");
        client.post().uri("/sqlite-rag/ingest")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isBadRequest();
        verify(mockService, never()).ingest(anyString(), anyString());
    }

    @Test
    void ingest_ok() {
        when(mockService.ingest("投喂测试", "这是一段足够长的投喂文本，用来验证 SQLite 写入与索引链路是否完整可用，顺便验证最近邻检索。"))
                .thenReturn(Mono.just(java.util.Map.of("docId", 1, "chunks", 1)));
        ObjectNode body = MAPPER.createObjectNode();
        body.put("title", "投喂测试");
        body.put("text", "这是一段足够长的投喂文本，用来验证 SQLite 写入与索引链路是否完整可用，顺便验证最近邻检索。");
        client.post().uri("/sqlite-rag/ingest")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.docId").isEqualTo(1);
    }
}
