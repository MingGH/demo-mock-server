package run.runnable.numfeelservice.web;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.TransportSnapshotResponse;
import run.runnable.numfeelservice.service.TransportLabService;

import java.time.Duration;
import java.time.Instant;
import java.util.Random;

/**
 * 传输实验 WebSocket 处理器。
 * 支持通用模式（snapshot + 混合事件）和场景模式（trading/profile/dashboard/gaming）。
 */
@Component
public class TransportLabWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TransportLabWebSocketHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Random RNG = new Random();

    private static final String[] STOCK_SYMBOLS = {"BTC/USD", "ETH/USD", "AAPL", "GOOGL", "TSLA", "NVDA"};
    private static final String[] METRIC_KEYS = {"cpu", "memory", "qps", "conns", "p99"};
    private static final String[] METRIC_LABELS = {"CPU 使用率", "内存使用率", "QPS", "活跃连接数", "P99 延迟"};
    private static final String[] GAME_NAMES = {"战士·铁壁", "法师·星火", "刺客·影刃", "牧师·圣光", "射手·猎风", "骑士·黎明"};
    private static final String[] GAME_CLASSES = {"warrior", "mage", "assassin", "priest", "archer", "knight"};

    // 资料页字段（顺序推送）
    private static final Object[][] PROFILE_FIELDS = {
            {"avatar", "https://i.pravatar.cc/120?u=profile-demo", "头像"},
            {"name", "李思远", "姓名"},
            {"email", "lisiyuan@example.com", "邮箱"},
            {"phone", "+86 138-0000-1234", "手机"},
            {"company", "数感科技有限公司", "公司"},
            {"position", "高级前端工程师", "职位"},
            {"bio", "热爱技术、摄影和徒步。相信好的产品是克制出来的。", "简介"},
            {"joinDate", "2022-03-15", "入职日期"},
    };

    private final TransportLabService transportLabService;

    public TransportLabWebSocketHandler(TransportLabService transportLabService) {
        this.transportLabService = transportLabService;
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        var scenario = resolveScenario(session);
        var delayMs = resolveDelay(session);
        var outgoing = scenario.isEmpty()
                ? buildGenericMessages(session)
                : buildScenarioMessages(session, scenario, delayMs);

        var incoming = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .flatMap(payload -> handleClientMessage(session, payload))
                .then();

        return Mono.zip(session.send(outgoing), incoming).then();
    }

    // ── 通用模式 ──

    private Flux<WebSocketMessage> buildGenericMessages(WebSocketSession session) {
        var query = resolveQuery(session);
        var snapshot = transportLabService.snapshot(query);
        var hello = Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("type", "snapshot");
            node.put("serverTime", Instant.now().toEpochMilli());
            node.putPOJO("data", snapshot);
            return session.textMessage(node.toString());
        });
        var events = Flux.interval(Duration.ofMillis(260))
                .take(Math.min(snapshot.eventCount(), 20))
                .map(seq -> buildGenericEvent(seq + 1))
                .map(node -> {
                    node.put("serverTime", Instant.now().toEpochMilli());
                    return session.textMessage(node.toString());
                });
        return Flux.concat(hello, events);
    }

    private ObjectNode buildGenericEvent(long seq) {
        var node = MAPPER.createObjectNode();
        switch ((int) (seq % 3)) {
            case 0 -> {
                node.put("type", "tick");
                node.put("seq", seq);
                node.put("symbol", STOCK_SYMBOLS[RNG.nextInt(STOCK_SYMBOLS.length)]);
                node.put("price", Math.round((100 + RNG.nextDouble() * 900) * 100) / 100.0);
                node.put("change", Math.round((RNG.nextDouble() - 0.48) * 500) / 100.0);
                node.put("volume", 100 + RNG.nextInt(5000));
            }
            case 1 -> {
                node.put("type", "order");
                node.put("seq", seq);
                node.put("orderId", "ORD-" + (1000 + RNG.nextInt(9000)));
                node.put("status", RNG.nextBoolean() ? "filled" : "created");
                node.put("amount", Math.round((100 + RNG.nextDouble() * 9900) * 100) / 100.0);
            }
            default -> {
                node.put("type", "metric");
                node.put("seq", seq);
                int idx = RNG.nextInt(METRIC_KEYS.length);
                node.put("name", METRIC_KEYS[idx]);
                node.put("label", METRIC_LABELS[idx]);
                node.put("value", Math.round((10 + RNG.nextDouble() * 90) * 10) / 10.0);
                node.put("unit", "%");
            }
        }
        return node;
    }

    // ── 场景模式 ──

    private Flux<WebSocketMessage> buildScenarioMessages(WebSocketSession session, String scenario, long delayMs) {
        var ready = Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("type", "ready");
            node.put("scenario", scenario);
            node.put("delayMs", delayMs);
            node.put("serverTime", Instant.now().toEpochMilli());
            return session.textMessage(node.toString());
        });

        Flux<ObjectNode> dataEvents = switch (scenario) {
            case "trading" -> buildTradingEvents(delayMs);
            case "profile" -> buildProfileEvents(delayMs);
            case "dashboard" -> buildDashboardEvents(delayMs);
            case "gaming" -> buildGamingEvents(delayMs);
            case "idle" -> buildIdleEvents(delayMs);
            default -> Flux.empty();
        };

        var messages = dataEvents
                .map(node -> {
                    node.put("serverTime", Instant.now().toEpochMilli());
                    return session.textMessage(node.toString());
                });

        return Flux.concat(ready, messages);
    }

    /** 行情盘：按延迟推 tick */
    private Flux<ObjectNode> buildTradingEvents(long delayMs) {
        return Flux.interval(Duration.ofMillis(delayMs))
                .map(seq -> {
                    var node = MAPPER.createObjectNode();
                    node.put("type", "tick");
                    node.put("seq", seq + 1);
                    node.put("symbol", STOCK_SYMBOLS[RNG.nextInt(STOCK_SYMBOLS.length)]);
                    node.put("price", Math.round((100 + RNG.nextDouble() * 900) * 100) / 100.0);
                    node.put("change", Math.round((RNG.nextDouble() - 0.48) * 500) / 100.0);
                    node.put("volume", 100 + RNG.nextInt(5000));
                    return node;
                });
    }

    /** 资料页：按延迟逐字段推送 */
    private Flux<ObjectNode> buildProfileEvents(long delayMs) {
        return Flux.interval(Duration.ofMillis(delayMs))
                .take(PROFILE_FIELDS.length)
                .map(idx -> {
                    var node = MAPPER.createObjectNode();
                    node.put("type", "profile_field");
                    node.put("seq", idx + 1);
                    node.put("total", PROFILE_FIELDS.length);
                    node.put("key", (String) PROFILE_FIELDS[idx.intValue()][0]);
                    node.put("value", (String) PROFILE_FIELDS[idx.intValue()][1]);
                    node.put("label", (String) PROFILE_FIELDS[idx.intValue()][2]);
                    return node;
                })
                .concatWith(Mono.fromSupplier(() -> {
                    var done = MAPPER.createObjectNode();
                    done.put("type", "profile_done");
                    done.put("total", PROFILE_FIELDS.length);
                    return done;
                }));
    }

    /** 数据看板：按延迟推指标 */
    private Flux<ObjectNode> buildDashboardEvents(long delayMs) {
        return Flux.interval(Duration.ofMillis(delayMs))
                .map(seq -> {
                    var node = MAPPER.createObjectNode();
                    node.put("type", "dashboard_snapshot");
                    node.put("seq", seq + 1);
                    var arr = MAPPER.createArrayNode();
                    for (int i = 0; i < METRIC_KEYS.length; i++) {
                        var m = MAPPER.createObjectNode();
                        m.put("key", METRIC_KEYS[i]);
                        m.put("label", METRIC_LABELS[i]);
                        m.put("value", Math.round((10 + RNG.nextDouble() * 90) * 10) / 10.0);
                        m.put("unit", i == 2 ? "req/s" : i == 4 ? "ms" : "%");
                        arr.add(m);
                    }
                    node.set("metrics", arr);
                    return node;
                });
    }

    /** 游戏：按延迟推送玩家状态 */
    private Flux<ObjectNode> buildGamingEvents(long delayMs) {
        var maxHps = new int[]{4500, 2500, 1800, 3000, 2000, 5000};
        return Flux.interval(Duration.ofMillis(delayMs))
                .map(seq -> {
                    var node = MAPPER.createObjectNode();
                    node.put("type", "game_state");
                    node.put("seq", seq + 1);
                    var arr = MAPPER.createArrayNode();
                    for (int i = 0; i < 6; i++) {
                        var p = MAPPER.createObjectNode();
                        p.put("id", "P" + (i + 1));
                        p.put("name", GAME_NAMES[i]);
                        p.put("cls", GAME_CLASSES[i]);
                        p.put("maxHp", maxHps[i]);
                        p.put("hp", Math.max(1, maxHps[i] - RNG.nextInt(maxHps[i])));
                        p.put("x", 10 + RNG.nextInt(80));
                        p.put("y", 10 + RNG.nextInt(80));
                        arr.add(p);
                    }
                    node.set("players", arr);
                    return node;
                });
    }

    /** 空闲心跳：按延迟推送最小心跳包，持续不断 */
    private Flux<ObjectNode> buildIdleEvents(long delayMs) {
        return Flux.interval(Duration.ofMillis(delayMs))
                .map(seq -> {
                    var node = MAPPER.createObjectNode();
                    node.put("type", "heartbeat");
                    node.put("seq", seq + 1);
                    return node;
                });
    }

    // ── 客户端消息 ──

    private Mono<Void> handleClientMessage(WebSocketSession session, String payload) {
        try {
            var node = (ObjectNode) MAPPER.readTree(payload);
            if ("ping".equals(node.path("type").asText())) {
                var pong = MAPPER.createObjectNode();
                pong.put("type", "pong");
                pong.put("clientTime", node.path("clientTime").asLong());
                pong.put("serverTime", Instant.now().toEpochMilli());
                return session.send(Mono.just(session.textMessage(pong.toString()))).then();
            }
        } catch (Exception e) {
            log.debug("WS client message parse skipped: {}", e.getMessage());
        }
        return Mono.empty();
    }

    // ── 参数解析 ──

    private String resolveScenario(WebSocketSession session) {
        var params = UriComponentsBuilder.fromUri(session.getHandshakeInfo().getUri())
                .build().getQueryParams();
        var scenario = params.getFirst("scenario");
        return scenario == null || scenario.isBlank() ? "" : scenario.trim().toLowerCase();
    }

    private long resolveDelay(WebSocketSession session) {
        var params = UriComponentsBuilder.fromUri(session.getHandshakeInfo().getUri())
                .build().getQueryParams();
        var scenario = resolveScenario(session);
        var isIdle = "idle".equals(scenario);
        var maxDelay = isIdle ? 300_000L : 3000L;
        var defaultDelay = isIdle ? 30_000L : 350L;
        try {
            var val = params.getFirst("delay");
            if (val != null && !val.isBlank()) {
                return Math.max(isIdle ? 1000 : 50, Math.min(Long.parseLong(val), maxDelay));
            }
        } catch (NumberFormatException ignored) {
        }
        return defaultDelay;
    }

    private TransportLabQuery resolveQuery(WebSocketSession session) {
        var params = UriComponentsBuilder.fromUri(session.getHandshakeInfo().getUri())
                .build().getQueryParams();
        return new TransportLabQuery(
                params.getFirst("eventsPerMinute"),
                params.getFirst("payloadSize"),
                params.getFirst("activeSeconds"),
                params.getFirst("clients"),
                params.getFirst("pollInterval"),
                params.getFirst("reconnects"));
    }
}
