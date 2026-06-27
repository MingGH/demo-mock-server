package run.runnable.numfeelservice.web;

import tools.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Random;

/**
 * 传输实验 WebSocket 处理器。
 * 推送模拟业务事件（股票行情/订单更新/系统指标），同时支持客户端 ping/pong。
 */
@Component
public class TransportLabWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TransportLabWebSocketHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Random RNG = new Random();

    private static final List<String> STOCK_SYMBOLS = List.of(
            "BTC/USD", "ETH/USD", "AAPL", "GOOGL", "TSLA", "NVDA");
    private static final List<String> ORDER_STATUSES = List.of(
            "created", "confirmed", "filled", "cancelled");
    private static final List<String> METRIC_NAMES = List.of(
            "cpu_usage", "mem_usage", "qps", "active_conns", "p99_latency");

    private final TransportLabService transportLabService;

    public TransportLabWebSocketHandler(TransportLabService transportLabService) {
        this.transportLabService = transportLabService;
    }

    /**
     * 处理 WebSocket 会话：握手后推送 snapshot + 模拟业务事件，同时监听客户端 ping。
     *
     * @param session WebSocket 会话
     * @return 完成信号
     */
    @Override
    public Mono<Void> handle(WebSocketSession session) {
        var query = resolveQuery(session);
        var snapshot = transportLabService.snapshot(query);
        var outgoing = buildMessages(session, snapshot);

        // 同时监听客户端发来的消息（ping 等）
        var incoming = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .flatMap(payload -> handleClientMessage(session, payload))
                .then();

        return Mono.zip(session.send(outgoing), incoming).then();
    }

    private Flux<WebSocketMessage> buildMessages(WebSocketSession session,
                                                  TransportSnapshotResponse snapshot) {
        // 首条：快照结果
        var hello = Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("type", "snapshot");
            node.put("serverTime", Instant.now().toEpochMilli());
            node.putPOJO("data", snapshot);
            return session.textMessage(node.toString());
        });

        // 后续：模拟业务事件
        var eventCount = Math.min(snapshot.eventCount(), 20);
        var events = Flux.interval(Duration.ofMillis(260))
                .take(eventCount)
                .map(seq -> buildEvent(seq + 1))
                .map(node -> {
                    node.put("serverTime", Instant.now().toEpochMilli());
                    return session.textMessage(node.toString());
                });

        return Flux.concat(hello, events);
    }

    /**
     * 生成一条模拟业务事件。
     * 事件类型轮流切换：tick → order → metric → tick → ...
     */
    private ObjectNode buildEvent(long seq) {
        var node = MAPPER.createObjectNode();
        var category = (int) (seq % 3);

        switch (category) {
            case 0 -> {
                // 股票行情
                var symbol = STOCK_SYMBOLS.get(RNG.nextInt(STOCK_SYMBOLS.size()));
                var price = 100 + RNG.nextDouble() * 900;
                var change = Math.round((RNG.nextDouble() - 0.48) * 500) / 100.0;
                node.put("type", "tick");
                node.put("seq", seq);
                node.put("symbol", symbol);
                node.put("price", Math.round(price * 100) / 100.0);
                node.put("change", change);
                node.put("volume", 100 + RNG.nextInt(5000));
            }
            case 1 -> {
                // 订单更新
                node.put("type", "order");
                node.put("seq", seq);
                node.put("orderId", "ORD-" + (1000 + RNG.nextInt(9000)));
                node.put("status", ORDER_STATUSES.get(RNG.nextInt(ORDER_STATUSES.size())));
                node.put("amount", Math.round((100 + RNG.nextDouble() * 9900) * 100) / 100.0);
            }
            default -> {
                // 系统指标
                node.put("type", "metric");
                node.put("seq", seq);
                node.put("name", METRIC_NAMES.get(RNG.nextInt(METRIC_NAMES.size())));
                node.put("value", Math.round((10 + RNG.nextDouble() * 90) * 10) / 10.0);
                node.put("unit", "%");
            }
        }
        return node;
    }

    /**
     * 处理客户端消息：支持 ping → pong。
     */
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

    private TransportLabQuery resolveQuery(WebSocketSession session) {
        var queryParams = UriComponentsBuilder.fromUri(session.getHandshakeInfo().getUri())
                .build()
                .getQueryParams();
        return new TransportLabQuery(
                queryParams.getFirst("eventsPerMinute"),
                queryParams.getFirst("payloadSize"),
                queryParams.getFirst("activeSeconds"),
                queryParams.getFirst("clients"),
                queryParams.getFirst("pollInterval"),
                queryParams.getFirst("reconnects"));
    }
}
