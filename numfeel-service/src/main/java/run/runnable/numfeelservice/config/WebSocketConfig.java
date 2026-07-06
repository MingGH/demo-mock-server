package run.runnable.numfeelservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import run.runnable.numfeelservice.web.StealthChannelWebSocketHandler;
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
     * 注册隐身通道 demo 的 WebRTC 信令中继路由。
     *
     * @param handler 隐身通道信令 handler
     * @return HandlerMapping 实例
     */
    @Bean
    public HandlerMapping stealthChannelWebSocketMapping(StealthChannelWebSocketHandler handler) {
        var mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(Map.of("/stealth-channel/ws", handler));
        mapping.setOrder(-1);
        return mapping;
    }
}
