package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.EventRequests.EventCollectRequest;
import run.runnable.numfeelservice.controller.dto.EventRequests.EventItem;
import run.runnable.numfeelservice.service.EventCollectService;
import run.runnable.numfeelservice.service.EventSummaryService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 通用行为埋点 HTTP 处理器。
 * <p>
 * POST /events/collect        — 批量上报事件（fire-and-forget，坏数据按条丢弃不影响整批）
 * GET  /events/summary?demo=  — 查询某个 demo 的聚合摘要（只读，不暴露原始事件行）
 */
@RestController
@RequestMapping("/events")
public class EventController {

    private static final Logger log = LoggerFactory.getLogger(EventController.class);

    private static final Pattern DEMO_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9-]{0,63}$");
    private static final Pattern SESSION_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{8,32}$");

    private final EventCollectService collectService;
    private final EventSummaryService summaryService;

    public EventController(EventCollectService collectService, EventSummaryService summaryService) {
        this.collectService = collectService;
        this.summaryService = summaryService;
    }

    /**
     * 批量上报事件。demo / sessionId 格式不合法直接 400；events 中单条不合法只丢弃该条。
     */
    @PostMapping("/collect")
    public Mono<ResponseEntity<JsonNode>> collect(
            @RequestBody(required = false) EventCollectRequest request,
            ServerHttpRequest httpRequest) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON");
        }
        String demo = request.demo();
        if (demo == null || !DEMO_PATTERN.matcher(demo).matches()) {
            throw ApiException.badRequest("Invalid demo");
        }
        String sessionId = request.sessionId();
        if (sessionId == null || !SESSION_ID_PATTERN.matcher(sessionId).matches()) {
            throw ApiException.badRequest("Invalid sessionId");
        }

        List<EventItem> events = request.events();
        List<EventItem> truncated = events == null
                ? List.of()
                : events.subList(0, Math.min(events.size(), EventCollectService.MAX_EVENTS_PER_BATCH));

        String clientIp = ClientIp.resolve(httpRequest);
        return collectService.collect(demo, sessionId, truncated, clientIp)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("events collect error: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 查询指定 demo 的聚合摘要（会话数、事件总数、按事件名分组的计数）。
     */
    @GetMapping("/summary")
    public Mono<ResponseEntity<JsonNode>> summary(@RequestParam String demo) {
        if (demo == null || !DEMO_PATTERN.matcher(demo).matches()) {
            throw ApiException.badRequest("Invalid demo");
        }
        return summaryService.summary(demo)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("events summary error: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
