package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.SqliteLabService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * SQLite 并发压力实验室 HTTP 处理器。
 * <p>
 * POST /sqlite-lab/write       — 执行一次写入
 * POST /sqlite-lab/burst       — 模拟 N 个并发写入
 * GET  /sqlite-lab/stats       — 查询当前数据库状态
 * POST /sqlite-lab/reset       — 重置数据库
 */
@RestController
@RequestMapping("/sqlite-lab")
public class SqliteLabController {

    private static final Logger log = LoggerFactory.getLogger(SqliteLabController.class);

    private final SqliteLabService service;

    public SqliteLabController(SqliteLabService service) {
        this.service = service;
    }

    /**
     * 单次写入。前端每次点击触发一次真实的 SQLite INSERT。
     */
    @PostMapping("/write")
    public Mono<ResponseEntity<JsonNode>> write() {
        return service.singleWrite("user-click")
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("sqlite-lab write error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 并发压测。模拟指定数量的并发写入，返回成功/失败统计和延迟分位数。
     *
     * @param body JSON body: { "concurrency": 10, "walMode": false }
     */
    @PostMapping("/burst")
    public Mono<ResponseEntity<JsonNode>> burst(@RequestBody(required = false) Map<String, Object> body) {
        int concurrency = extractInt(body, "concurrency", 10);
        boolean walMode = extractBool(body, "walMode", false);

        if (concurrency < 1 || concurrency > 200) {
            throw ApiException.badRequest("concurrency must be between 1 and 200");
        }

        return service.burst(concurrency, walMode)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("sqlite-lab burst error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 查询当前 SQLite 数据库状态：行数、文件大小、实时 QPS。
     */
    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("sqlite-lab stats error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 重置数据库（清空所有数据）。
     */
    @PostMapping("/reset")
    public Mono<ResponseEntity<JsonNode>> reset() {
        return service.reset()
                .then(Mono.fromSupplier(() -> ApiResponse.ok(Map.of("reset", true))))
                .onErrorResume(err -> {
                    log.error("sqlite-lab reset error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    // ============= 参数提取辅助 =============

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

    private static boolean extractBool(Map<String, Object> body, String key, boolean defaultVal) {
        if (body == null || !body.containsKey(key)) return defaultVal;
        Object val = body.get(key);
        if (val instanceof Boolean b) return b;
        return Boolean.parseBoolean(val.toString());
    }
}
