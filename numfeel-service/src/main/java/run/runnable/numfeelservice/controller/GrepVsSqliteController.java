package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.GrepVsSqliteService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 文件+Grep vs SQLite 存储对决 HTTP 处理器。
 * <p>
 * GET  /grep-vs-sqlite/status        — 数据集状态
 * POST /grep-vs-sqlite/search        — 搜索对比
 * POST /grep-vs-sqlite/insert        — 写入对比
 * POST /grep-vs-sqlite/complex-query — 复杂查询对比
 * POST /grep-vs-sqlite/delete        — 删除对比
 * POST /grep-vs-sqlite/reinit        — 重新生成数据
 */
@RestController
@RequestMapping("/grep-vs-sqlite")
public class GrepVsSqliteController {

    private static final Logger log = LoggerFactory.getLogger(GrepVsSqliteController.class);

    private final GrepVsSqliteService service;

    public GrepVsSqliteController(GrepVsSqliteService service) {
        this.service = service;
    }

    /**
     * 获取数据集当前状态：消息数、文件大小、数据库大小。
     */
    @GetMapping("/status")
    public Mono<ResponseEntity<JsonNode>> status() {
        return service.status()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite status error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 搜索对比：grep 全文扫描 vs SQLite FTS5。
     *
     * @param body JSON body: { "keyword": "火锅" }
     */
    @PostMapping("/search")
    public Mono<ResponseEntity<JsonNode>> search(@RequestBody(required = false) Map<String, Object> body) {
        String keyword = extractString(body, "keyword");
        if (keyword == null || keyword.isBlank()) {
            throw ApiException.badRequest("keyword is required");
        }
        if (keyword.length() > 50) {
            throw ApiException.badRequest("keyword too long (max 50 chars)");
        }

        return service.search(keyword)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite search error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 写入对比：文件 append vs SQLite INSERT。
     *
     * @param body JSON body: { "content": "消息内容", "sender": "张三" }
     */
    @PostMapping("/insert")
    public Mono<ResponseEntity<JsonNode>> insert(@RequestBody(required = false) Map<String, Object> body) {
        String content = extractString(body, "content");
        String sender = extractString(body, "sender");
        if (content == null || content.isBlank()) {
            throw ApiException.badRequest("content is required");
        }
        if (content.length() > 500) {
            throw ApiException.badRequest("content too long (max 500 chars)");
        }
        if (sender == null || sender.isBlank()) {
            sender = "匿名用户";
        }

        return service.insert(content, sender)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite insert error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 复杂查询对比：grep 逐行解析 vs SQLite WHERE + INDEX。
     *
     * @param body JSON body: { "type": "image", "recentDays": 7 }
     */
    @PostMapping("/complex-query")
    public Mono<ResponseEntity<JsonNode>> complexQuery(@RequestBody(required = false) Map<String, Object> body) {
        String type = extractString(body, "type");
        int recentDays = extractInt(body, "recentDays", 7);

        if (type == null || type.isBlank()) {
            throw ApiException.badRequest("type is required");
        }
        if (recentDays < 1 || recentDays > 365) {
            throw ApiException.badRequest("recentDays must be between 1 and 365");
        }

        return service.complexQuery(type, recentDays)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite complex-query error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 删除对比：文件重写 vs SQL DELETE。
     *
     * @param body JSON body: { "keyword": "快递" }
     */
    @PostMapping("/delete")
    public Mono<ResponseEntity<JsonNode>> delete(@RequestBody(required = false) Map<String, Object> body) {
        String keyword = extractString(body, "keyword");
        if (keyword == null || keyword.isBlank()) {
            throw ApiException.badRequest("keyword is required");
        }
        if (keyword.length() > 50) {
            throw ApiException.badRequest("keyword too long (max 50 chars)");
        }

        return service.delete(keyword)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite delete error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 重新生成数据集。
     *
     * @param body JSON body: { "count": 100000 }
     */
    @PostMapping("/reinit")
    public Mono<ResponseEntity<JsonNode>> reinit(@RequestBody(required = false) Map<String, Object> body) {
        int count = extractInt(body, "count", 100_000);
        if (count < 1000 || count > 1_000_000) {
            throw ApiException.badRequest("count must be between 1000 and 1000000");
        }

        return service.reinit(count)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("grep-vs-sqlite reinit error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    // ============= 参数提取辅助 =============

    private static String extractString(Map<String, Object> body, String key) {
        if (body == null || !body.containsKey(key)) return null;
        Object val = body.get(key);
        return val == null ? null : val.toString();
    }

    private static int extractInt(Map<String, Object> body, String key, int defaultVal) {
        if (body == null || !body.containsKey(key)) return defaultVal;
        Object val = body.get(key);
        if (val instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }
}
