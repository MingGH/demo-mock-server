package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.SqliteRagLabService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * SQLite RAG 实验室 — "一个文件的 AI 大脑" HTTP 处理器。
 * <p>
 * GET  /sqlite-rag/info    — 数据库版本、知识条数、文件大小
 * POST /sqlite-rag/ask     — 混合检索（关键词 + 向量 + RRF），带毫秒计时
 * POST /sqlite-rag/battle  — 盲测对战：双通道各出卡 + 融合答案
 * POST /sqlite-rag/ingest  — 投喂新文档（切块 + 向量化 + 落盘）
 */
@RestController
@RequestMapping("/sqlite-rag")
public class SqliteRagLabController {

    private static final Logger log = LoggerFactory.getLogger(SqliteRagLabController.class);

    private final SqliteRagLabService service;

    public SqliteRagLabController(SqliteRagLabService service) {
        this.service = service;
    }

    @GetMapping("/info")
    public Mono<ResponseEntity<JsonNode>> info() {
        return service.info()
                .map(ApiResponse::ok)
                .onErrorResume(err -> errorLog(err, "info"));
    }

    @PostMapping("/ask")
    public Mono<ResponseEntity<JsonNode>> ask(@RequestBody(required = false) java.util.Map<String, Object> body) {
        String query = extractString(body, "query");
        if (query == null || query.isBlank()) {
            throw ApiException.badRequest("query is required");
        }
        if (query.length() > 100) {
            throw ApiException.badRequest("query too long (max 100 chars)");
        }
        return service.ask(query)
                .map(ApiResponse::ok)
                .onErrorResume(err -> errorLog(err, "ask"));
    }

    @PostMapping("/battle")
    public Mono<ResponseEntity<JsonNode>> battle(@RequestBody(required = false) java.util.Map<String, Object> body) {
        String query = extractString(body, "query");
        if (query == null || query.isBlank()) {
            throw ApiException.badRequest("query is required");
        }
        if (query.length() > 100) {
            throw ApiException.badRequest("query too long (max 100 chars)");
        }
        return service.battle(query)
                .map(ApiResponse::ok)
                .onErrorResume(err -> errorLog(err, "battle"));
    }

    @PostMapping("/ingest")
    public Mono<ResponseEntity<JsonNode>> ingest(@RequestBody(required = false) java.util.Map<String, Object> body) {
        String title = extractString(body, "title");
        String text = extractString(body, "text");
        if (text == null || text.strip().length() < 30) {
            throw ApiException.badRequest("text is required (at least 30 chars)");
        }
        if (text.length() > 2000) {
            throw ApiException.badRequest("text too long (max 2000 chars)");
        }
        String safeTitle = title == null || title.isBlank() ? "未命名记忆" : title;
        return service.ingest(safeTitle, text)
                .map(ApiResponse::ok)
                .onErrorResume(err -> errorLog(err, "ingest"));
    }

    private static String extractString(java.util.Map<String, Object> body, String key) {
        if (body == null) {
            return null;
        }
        Object v = body.get(key);
        return v instanceof String s ? s : null;
    }

    private static Mono<ResponseEntity<JsonNode>> errorLog(Throwable err, String action) {
        LoggerFactory.getLogger(SqliteRagLabController.class)
                .error("sqlite-rag {} error", action, err);
        return Mono.just(ApiResponse.error(500, "Internal error"));
    }
}
