package run.runnable.numfeelservice.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.JsBinaryLabService;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.util.Base64;

/**
 * JS 二进制实验室 WebSocket 处理器。
 *
 * <p>客户端发送 {"scenario":"fib"}，服务端在线编译对应 JS 场景为二进制，
 * 通过 WebSocket 实时推送进度，最终推送 base64 编码的产物下载。</p>
 */
@Component
public class JsBinaryLabWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(JsBinaryLabWebSocketHandler.class);

    private final JsBinaryLabService jsBinaryLabService;
    private final ObjectMapper mapper;

    /**
     * 构造器注入。
     *
     * @param jsBinaryLabService 编译服务
     * @param mapper             Jackson ObjectMapper
     */
    public JsBinaryLabWebSocketHandler(JsBinaryLabService jsBinaryLabService, ObjectMapper mapper) {
        this.jsBinaryLabService = jsBinaryLabService;
        this.mapper = mapper;
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        return session.receive()
                .next()
                .flatMap(message -> {
                    var payload = message.getPayloadAsText();
                    String scenario;
                    try {
                        var node = (ObjectNode) mapper.readTree(payload);
                        scenario = node.path("scenario").asText();
                        if (scenario == null || scenario.isBlank()) {
                            return sendJson(session, errorNode("缺少 scenario 字段"))
                                    .then(Mono.fromRunnable(() -> closeQuietly(session)));
                        }
                    } catch (Exception e) {
                        log.warn("JS Binary Lab WS 消息解析失败: {}", e.getMessage());
                        return sendJson(session, errorNode("无效的 JSON 请求: " + e.getMessage()))
                                .then(Mono.fromRunnable(() -> closeQuietly(session)));
                    }

                    return jsBinaryLabService.compile(scenario, (stage, percent, message) -> {
                                // 在回调线程内通过 session 发送，注意此处是异步 fire-and-forget
                                sendJsonAsync(session, progressNode(stage, percent, message));
                            })
                            .flatMap(outputPath -> {
                                try {
                                    var bytes = Files.readAllBytes(outputPath);
                                    var b64 = Base64.getEncoder().encodeToString(bytes);
                                    var filename = "output-" + scenario;
                                    return sendJson(session, downloadNode(b64, filename, bytes.length))
                                            .then(Mono.fromRunnable(() -> closeQuietly(session)));
                                } catch (IOException e) {
                                    log.warn("JS Binary 产物读取失败: {}", e.getMessage());
                                    return sendJson(session, errorNode("产物读取失败: " + e.getMessage()))
                                            .then(Mono.fromRunnable(() -> closeQuietly(session)));
                                }
                            })
                            .onErrorResume(e -> {
                                log.warn("JS Binary 编译失败: {}", e.getMessage());
                                return sendJson(session, errorNode("编译失败: " + e.getMessage()))
                                        .then(Mono.fromRunnable(() -> closeQuietly(session)));
                            });
                })
                .then();
    }

    // ── JSON 构造 ──

    private ObjectNode progressNode(String stage, int percent, String message) {
        var node = mapper.createObjectNode();
        node.put("type", "progress");
        node.put("stage", stage);
        node.put("percent", percent);
        node.put("message", message);
        return node;
    }

    private ObjectNode downloadNode(String data, String filename, long size) {
        var node = mapper.createObjectNode();
        node.put("type", "download");
        node.put("data", data);
        node.put("filename", filename);
        node.put("size", size);
        return node;
    }

    private ObjectNode errorNode(String message) {
        var node = mapper.createObjectNode();
        node.put("type", "error");
        node.put("message", message);
        return node;
    }

    // ── 发送辅助 ──

    /**
     * 将对象序列化为 JSON 并通过 WebSocket 发送。
     *
     * @param session WebSocket 会话
     * @param obj     待序列化的对象
     * @return 发送完成的 Mono
     */
    private Mono<Void> sendJson(WebSocketSession session, Object obj) {
        try {
            var text = mapper.writeValueAsString(obj);
            return session.send(Mono.just(session.textMessage(text))).then();
        } catch (Exception e) {
            log.warn("JS Binary WS JSON 序列化失败: {}", e.getMessage());
            return Mono.empty();
        }
    }

    /**
     * 异步 fire-and-forget 发送 JSON（用于回调线程中推送进度，不阻塞回调）。
     *
     * @param session WebSocket 会话
     * @param obj     待序列化的对象
     */
    private void sendJsonAsync(WebSocketSession session, Object obj) {
        try {
            var text = mapper.writeValueAsString(obj);
            session.send(Mono.just(session.textMessage(text))).subscribe(
                    null,
                    e -> log.debug("JS Binary WS 进度推送失败: {}", e.getMessage())
            );
        } catch (Exception e) {
            log.debug("JS Binary WS JSON 序列化失败（async）: {}", e.getMessage());
        }
    }

    private void closeQuietly(WebSocketSession session) {
        session.close().subscribe(
                null,
                e -> log.debug("JS Binary WS 关闭失败: {}", e.getMessage())
        );
    }
}
