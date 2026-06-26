package run.runnable.numfeelservice.web;

import tools.jackson.databind.ObjectMapper;
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
     * 处理 WebSocket 会话，握手时通过 query string 接收参数并推送模拟业务事件。
     *
     * @param session WebSocket 会话
     * @return 完成信号
     */
    @Override
    public Mono<Void> handle(WebSocketSession session) {
        return session.send(buildMessages(session, resolveQuery(session)));
    }

    private Flux<WebSocketMessage> buildMessages(WebSocketSession session, TransportLabQuery query) {
        var snapshot = transportLabService.snapshot(query);
        var snapshotMessage = Mono.fromSupplier(() -> session.textMessage(toJson(snapshot)));
        var eventMessages = Flux.interval(Duration.ofMillis(260))
                .take(Math.min(snapshot.eventCount(), 10))
                .map(index -> session.textMessage(
                        "{\"type\":\"event\",\"seq\":" + (index + 1) + ",\"text\":\"server pushed event\"}"));
        return Flux.concat(snapshotMessage, eventMessages);
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

    private String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("Transport lab websocket serialize failed: {}", e.getMessage());
            return "{\"type\":\"error\",\"message\":\"serialize failed\"}";
        }
    }
}
