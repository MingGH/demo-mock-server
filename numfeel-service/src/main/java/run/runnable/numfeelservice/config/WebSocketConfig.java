package run.runnable.numfeelservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import run.runnable.numfeelservice.web.JsBinaryLabWebSocketHandler;
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
     * 注册 JS 二进制实验室 WebSocket 路由。
     *
     * @param handler JS 二进制实验室 WebSocket handler
     * @return HandlerMapping 实例
     */
    @Bean
    public HandlerMapping jsBinaryLabWebSocketMapping(JsBinaryLabWebSocketHandler handler) {
        var mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(Map.of("/js-binary-lab/ws", handler));
        mapping.setOrder(-1);
        return mapping;
    }
}
