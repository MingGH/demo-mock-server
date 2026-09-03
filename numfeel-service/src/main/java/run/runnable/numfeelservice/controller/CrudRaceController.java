package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CrudRaceService;
import run.runnable.numfeelservice.service.CrudRaceService.RunResult;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.Set;

/**
 * 增删改查引擎大赛 HTTP 处理器。
 * <p>
 * POST /crud-race/run    — 在指定引擎（text/mysql/caffeine）上跑一轮基准测试
 * GET  /crud-race/status — 各引擎可用性
 */
@RestController
@RequestMapping("/crud-race")
public class CrudRaceController {

    private static final Logger log = LoggerFactory.getLogger(CrudRaceController.class);

    /** 合法引擎名 */
    private static final Set<String> ENGINES = Set.of("text", "mysql", "caffeine");
    /** 合法操作名 */
    private static final Set<String> OPS = Set.of("get", "update", "insert", "delete");

    private final CrudRaceService service;

    public CrudRaceController(CrudRaceService service) {
        this.service = service;
    }

    /**
     * 跑一轮基准测试。
     *
     * @param body JSON body: { "engine": "text", "op": "get", "count": 100, "ops": 200 }
     * @return 基准结果（准备数据耗时与基准耗时分开统计）
     */
    @PostMapping("/run")
    public Mono<ResponseEntity<JsonNode>> run(@RequestBody(required = false) Map<String, Object> body) {
        String engine = extractString(body, "engine", "text");
        String op = extractString(body, "op", "get");
        int count = extractInt(body, "count", 100);
        int ops = extractInt(body, "ops", 200);

        if (!ENGINES.contains(engine)) {
            throw ApiException.badRequest("engine must be one of " + ENGINES);
        }
        if (!OPS.contains(op)) {
            throw ApiException.badRequest("op must be one of " + OPS);
        }
        if (count < 1 || count > CrudRaceService.MAX_COUNT) {
            throw ApiException.badRequest("count must be between 1 and " + CrudRaceService.MAX_COUNT);
        }
        if (ops < 1 || ops > CrudRaceService.MAX_OPS) {
            throw ApiException.badRequest("ops must be between 1 and " + CrudRaceService.MAX_OPS);
        }

        return service.run(engine, count, op, ops)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("crud-race run error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 各引擎可用性（text/mysql/caffeine），供前端展示与降级。
     */
    @GetMapping("/status")
    public Mono<ResponseEntity<JsonNode>> status() {
        return service.status()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("crud-race status error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    // ============= 参数提取辅助 =============

    private static String extractString(Map<String, Object> body, String key, String defaultVal) {
        if (body == null || body.get(key) == null) return defaultVal;
        String val = body.get(key).toString();
        return val.isEmpty() ? defaultVal : val;
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
