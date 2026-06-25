package run.runnable.numfeelservice.web;

import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.service.TransportLabService;

import java.time.Duration;

/**
 * 传输实验 WebSocket 处理器。
 */
@Component
public class TransportLabWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TransportLabWebSocketHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final TransportLabService transportLabService;

    public TransportLabWebSocketHandler(TransportLabService transportLabService) {
        this.transportLabService = transportLabService;
    }

    /**
     * 处理 WebSocket 会话，收到参数后持续推送模拟业务事件。
     *
     * @param session WebSocket 会话
     * @return 完成信号
     */
    @Override
    public Mono<Void> handle(WebSocketSession session) {
        var inbound = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .next()
                .defaultIfEmpty("{}");
        return inbound.flatMap(payload -> session.send(buildMessages(session, payload)));
    }

    private Flux<WebSocketMessage> buildMessages(WebSocketSession session, String payload) {
        TransportLabQuery query;
        try {
            query = MAPPER.readValue(payload, TransportLabQuery.class);
        } catch (Exception e) {
            log.warn("Transport lab websocket params parse failed: {}", e.getMessage());
            query = new TransportLabQuery(null, null, null, null, null, null);
        }
        var snapshot = transportLabService.snapshot(query);
        var snapshotMessage = Mono.fromSupplier(() -> session.textMessage(toJson(snapshot)));
        var eventMessages = Flux.interval(Duration.ofMillis(260))
                .take(Math.min(snapshot.eventCount(), 10))
                .map(index -> session.textMessage("{\"type\":\"event\",\"seq\":" + (index + 1) + ",\"text\":\"server pushed event\"}"));
        return Flux.concat(snapshotMessage, eventMessages);
    }

    private String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("Transport lab websocket serialize failed: {}", e.getMessage());
            return "{\"type\":\"error\",\"message\":\"serialize failed\"}";
        }
    }
}
