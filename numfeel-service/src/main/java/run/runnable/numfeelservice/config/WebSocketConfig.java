package run.runnable.numfeelservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;
import run.runnable.numfeelservice.web.TransportLabWebSocketHandler;

import java.util.Map;

/**
 * WebFlux WebSocket 端点配置。
 */
@Configuration
public class WebSocketConfig {

    /**
     * 注册传输实验 WebSocket 路由。
     *
     * @param handler 传输实验 WebSocket handler
     * @return HandlerMapping 实例
     */
    @Bean
    public HandlerMapping transportLabWebSocketMapping(TransportLabWebSocketHandler handler) {
        var mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(Map.of("/transport-lab/ws", handler));
        mapping.setOrder(-1);
        return mapping;
    }

    /**
     * 提供 WebFlux WebSocket 适配器。
     *
     * @return WebSocketHandlerAdapter 实例
     */
    @Bean
    public WebSocketHandlerAdapter webSocketHandlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}
