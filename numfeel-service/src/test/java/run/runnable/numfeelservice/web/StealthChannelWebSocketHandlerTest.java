package run.runnable.numfeelservice.web;

import org.junit.jupiter.api.Test;
import org.reactivestreams.Publisher;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * StealthChannelWebSocketHandler 单元测试。
 *
 * <p>通过 mock WebSocketSession 验证信令中继行为：加入房间、转发、不回声、异常容错、断开清理。
 */
class StealthChannelWebSocketHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final StealthChannelWebSocketHandler handler = new StealthChannelWebSocketHandler();

    /** 构造信令 JSON 字符串，与前端 buildSignal 格式一致。 */
    private static String signal(String type, String room, Object payload) throws Exception {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("type", type);
        node.put("room", room);
        if (payload == null) {
            node.putNull("payload");
        } else {
            node.putPOJO("payload", payload);
        }
        return MAPPER.writeValueAsString(node);
    }

    /** 构造一条入站消息（getPayloadAsText 返回给定字符串）。 */
    private static WebSocketMessage inbound(String payload) {
        WebSocketMessage m = mock(WebSocketMessage.class);
        when(m.getPayloadAsText()).thenReturn(payload);
        return m;
    }

    /**
     * 构造一个 mock WebSocketSession，捕获其出站文本消息到 sentSink。
     * send 返回 Mono.never() 模拟长连接不关闭，避免误触发 doFinally 清理。
     */
    @SuppressWarnings("unchecked")
    private WebSocketSession mockSession(String id, List<String> sentSink) {
        WebSocketSession s = mock(WebSocketSession.class);
        when(s.getId()).thenReturn(id);
        when(s.getAttributes()).thenReturn(new HashMap<>());
        when(s.textMessage(anyString())).thenAnswer(inv -> {
            WebSocketMessage m = mock(WebSocketMessage.class);
            when(m.getPayloadAsText()).thenReturn(inv.getArgument(0));
            return m;
        });
        when(s.send(any(Publisher.class))).thenAnswer(inv -> {
            Flux.<WebSocketMessage>from((Publisher<WebSocketMessage>) inv.getArgument(0))
                    .subscribe(m -> sentSink.add(m.getPayloadAsText()));
            return Mono.<Void>never();
        });
        return s;
    }

    @Test
    void relayForwardsOfferToOtherPeerInSameRoom() throws Exception {
        var room = "ABC123";
        var sentA = new ArrayList<String>();
        var sentB = new ArrayList<String>();
        var sessionA = mockSession("A", sentA);
        var sessionB = mockSession("B", sentB);

        var bJoin = inbound(signal("join", room, null));
        var bOffer = inbound(signal("offer", room, Map.of("sdp", "v=0")));
        var aJoin = inbound(signal("join", room, null));

        when(sessionA.receive()).thenReturn(Flux.concat(Flux.just(aJoin), Flux.<WebSocketMessage>never()));
        var subA = handler.handle(sessionA).subscribe();

        when(sessionB.receive()).thenReturn(Flux.just(bJoin, bOffer));
        handler.handle(sessionB).block();

        assertTrue(sentA.stream().anyMatch(m -> m.contains("\"offer\"") && m.contains(room)),
                "A 应收到 B 转发的 offer");
        assertTrue(sentB.stream().noneMatch(m -> m.contains("\"offer\"")),
                "B 不应收到自己发的 offer");
        subA.dispose();
    }

    @Test
    void relayDoesNotEchoBackToSender() throws Exception {
        var room = "XYZ999";
        var sent = new ArrayList<String>();
        var session = mockSession("S", sent);

        var join = inbound(signal("join", room, null));
        var ice = inbound(signal("ice", room, Map.of("candidate", "host")));

        when(session.receive()).thenReturn(Flux.just(join, ice));
        handler.handle(session).block();

        assertTrue(sent.stream().noneMatch(m -> m.contains("\"ice\"")),
                "自己发的 ice 不应回到自己");
    }

    @Test
    void unknownSignalTypeIgnored() throws Exception {
        var room = "QQQ111";
        var sentA = new ArrayList<String>();
        var sessionA = mockSession("A", sentA);
        var sessionB = mockSession("B", new ArrayList<>());

        var bJoin = inbound(signal("join", room, null));
        var bBogus = inbound(signal("bogus", room, null));
        var aJoin = inbound(signal("join", room, null));

        when(sessionA.receive()).thenReturn(Flux.concat(Flux.just(aJoin), Flux.<WebSocketMessage>never()));
        var subA = handler.handle(sessionA).subscribe();

        when(sessionB.receive()).thenReturn(Flux.just(bJoin, bBogus));
        handler.handle(sessionB).block();

        assertTrue(sentA.stream().noneMatch(m -> m.contains("\"bogus\"")),
                "未知 type 不应被转发");
        subA.dispose();
    }

    @Test
    void malformedJsonDoesNotThrow() {
        var sent = new ArrayList<String>();
        var session = mockSession("M", sent);

        var m1 = inbound("not a json");
        var m2 = inbound("{missing quotes}");

        when(session.receive()).thenReturn(Flux.just(m1, m2));
        // 不抛异常即通过
        handler.handle(session).block();
        assertTrue(sent.isEmpty(), "非法 JSON 不应触发任何转发");
    }

    @Test
    void peerRemovedOnDisconnectDoesNotReceiveRelay() throws Exception {
        var room = "DISCON";
        var sentA = new ArrayList<String>();
        var sessionA = mockSession("A", sentA);
        var sessionB = mockSession("B", new ArrayList<>());

        // A join 后 receive 立即 complete → doFinally 移除 A
        var aJoin = inbound(signal("join", room, null));
        when(sessionA.receive()).thenReturn(Flux.just(aJoin));
        handler.handle(sessionA).block();

        // B 之后发 offer
        var bJoin = inbound(signal("join", room, null));
        var bOffer = inbound(signal("offer", room, "sdp"));
        when(sessionB.receive()).thenReturn(Flux.just(bJoin, bOffer));
        handler.handle(sessionB).block();

        assertTrue(sentA.stream().noneMatch(m -> m.contains("\"offer\"")),
                "A 已断开，不应收到 B 的 offer");
    }

    @Test
    void joinWithBlankRoomIgnored() throws Exception {
        var sent = new ArrayList<String>();
        var session = mockSession("B", sent);

        var join = inbound(signal("join", "  ", null));
        var offer = inbound(signal("offer", "  ", "sdp"));

        when(session.receive()).thenReturn(Flux.just(join, offer));
        handler.handle(session).block();

        assertTrue(sent.isEmpty(), "空 room 不应加入，relay 应无目标");
    }
}
