package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.reactive.socket.client.ReactorNettyWebSocketClient;

import java.net.URI;
import java.time.Duration;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TransportLab WebSocket 集成测试。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TransportLabWebSocketIntegrationTest {

    @LocalServerPort
    private int port;

    @Test
    void websocket_returns_snapshot_then_events() {
        var messages = new CopyOnWriteArrayList<String>();
        var url = URI.create("ws://localhost:" + port
                + "/transport-lab/ws?eventsPerMinute=240&payloadSize=320"
                + "&activeSeconds=180&clients=800&pollInterval=2&reconnects=1");

        new ReactorNettyWebSocketClient()
                .execute(url, session -> session.receive()
                        .map(message -> message.getPayloadAsText())
                        .doOnNext(messages::add)
                        .take(4)
                        .then())
                .block(Duration.ofSeconds(8));

        assertThat(messages).hasSizeGreaterThanOrEqualTo(3);
        // 第一条 snapshot 包含推荐结果
        assertThat(messages.get(0)).contains("\"type\":\"snapshot\"");
        assertThat(messages.get(0)).contains("\"recommendation\":\"websocket\"");
        // 后续事件包含 serverTime
        assertThat(messages.get(1)).contains("\"type\"");
        assertThat(messages.get(1)).contains("\"serverTime\"");
    }

    @Test
    void websocket_idle_scenario_returns_heartbeats() {
        var messages = new CopyOnWriteArrayList<String>();
        var url = URI.create("ws://localhost:" + port
                + "/transport-lab/ws?scenario=idle&delay=50");

        new ReactorNettyWebSocketClient()
                .execute(url, session -> session.receive()
                        .map(message -> message.getPayloadAsText())
                        .doOnNext(messages::add)
                        .take(4)
                        .then())
                .block(Duration.ofSeconds(8));

        assertThat(messages).hasSizeGreaterThanOrEqualTo(3);
        // 第一条是 ready
        assertThat(messages.get(0)).contains("\"type\":\"ready\"");
        assertThat(messages.get(0)).contains("\"scenario\":\"idle\"");
        // 后续是 heartbeat
        assertThat(messages.get(1)).contains("\"type\":\"heartbeat\"");
        assertThat(messages.get(1)).contains("\"seq\"");
        assertThat(messages.get(1)).contains("\"serverTime\"");
    }
}
