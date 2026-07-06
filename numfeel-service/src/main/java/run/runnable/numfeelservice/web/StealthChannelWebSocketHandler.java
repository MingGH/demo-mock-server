package run.runnable.numfeelservice.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 隐身通道 demo 的 WebRTC 信令中继处理器。
 *
 * <p>维护 roomCode → peer 映射，将 offer / answer / ice 信令转发给同 room 的其他 peer。
 * 信令本身只负责交换 SDP 与 ICE，建立连接后数据走 P2P DataChannel，不经过本服务器。
 */
@Component
public class StealthChannelWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(StealthChannelWebSocketHandler.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String ATTR_ROOM = "stealth.room";

    /** roomCode → (peerId → peer 出站缓冲) */
    private final Map<String, Map<String, Peer>> rooms = new ConcurrentHashMap<>();

    /** 单个 peer 的标识与其专属出站 sink。 */
    record Peer(String id, Sinks.Many<String> sink) {
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        var peerId = session.getId();
        Sinks.Many<String> sink = Sinks.many().multicast().onBackpressureBuffer();
        var peer = new Peer(peerId, sink);

        var receive = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .flatMap(payload -> route(session, peer, payload))
                .then();

        var send = session.send(sink.asFlux().map(session::textMessage));

        return Mono.zip(receive, send)
                .doFinally(sig -> removePeer(session, peer))
                .then();
    }

    /**
     * 解析信令消息并按类型分发。
     *
     * @param session 当前 WebSocket 会话
     * @param peer    当前 peer
     * @param payload 客户端原始消息
     * @return 完成信号
     */
    private Mono<Void> route(WebSocketSession session, Peer peer, String payload) {
        try {
            var node = MAPPER.readTree(payload);
            var type = node.path("type").asText();
            var room = node.path("room").asText();
            switch (type) {
                case "join" -> joinRoom(session, peer, room);
                case "offer", "answer", "ice" -> relay(peer, room, payload);
                default -> log.debug("unknown signal type: {}", type);
            }
        } catch (Exception e) {
            log.warn("signal parse failed: {}", e.getMessage());
        }
        return Mono.empty();
    }

    /**
     * 将 peer 加入指定 room。
     *
     * @param session 当前 WebSocket 会话
     * @param peer    当前 peer
     * @param room    房间号
     */
    private void joinRoom(WebSocketSession session, Peer peer, String room) {
        if (room == null || room.isBlank()) {
            return;
        }
        session.getAttributes().put(ATTR_ROOM, room);
        rooms.computeIfAbsent(room, k -> new ConcurrentHashMap<>()).put(peer.id(), peer);
        log.debug("peer {} joined room {}", peer.id(), room);
    }

    /**
     * 将信令转发给同 room 中除发送者以外的所有 peer。
     *
     * @param sender  发送方 peer
     * @param room    房间号
     * @param payload 原始信令消息
     */
    private void relay(Peer sender, String room, String payload) {
        var peers = rooms.get(room);
        if (peers == null) {
            return;
        }
        peers.forEach((id, p) -> {
            if (!id.equals(sender.id())) {
                p.sink().tryEmitNext(payload);
            }
        });
    }

    /**
     * 连接关闭时从 room 移除 peer，room 空则清理。
     *
     * @param session 当前 WebSocket 会话
     * @param peer    当前 peer
     */
    private void removePeer(WebSocketSession session, Peer peer) {
        var room = (String) session.getAttributes().get(ATTR_ROOM);
        if (room == null) {
            return;
        }
        rooms.computeIfPresent(room, (k, peers) -> {
            peers.remove(peer.id());
            return peers.isEmpty() ? null : peers;
        });
        log.debug("peer {} left room {}", peer.id(), room);
    }
}
