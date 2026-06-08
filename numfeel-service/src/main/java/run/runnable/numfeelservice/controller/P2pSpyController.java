package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.P2pSpyService;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * P2P 隐私透视镜 HTTP 处理器。
 * <p>
 * GET /p2p/peers          — 获取指定 torrent 的模拟 peer 列表及地理分布
 * GET /p2p/torrents       — 获取预设 torrent 列表
 */
@RestController
@RequestMapping("/p2p")
public class P2pSpyController {

    private static final Logger log = LoggerFactory.getLogger(P2pSpyController.class);

    private final P2pSpyService service;

    public P2pSpyController(P2pSpyService service) {
        this.service = service;
    }

    /**
     * 获取指定预设 torrent 的模拟 peer 列表。
     *
     * @param index 预设 torrent 索引（可选，默认 0）
     * @return 包含 peer 地理分布和监控日志的完整结果
     */
    @GetMapping("/peers")
    public Mono<ResponseEntity<JsonNode>> peers(
            @RequestParam(value = "index", defaultValue = "0") int index) {
        return service.getPeers(index)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("P2P peers error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 获取所有预设 torrent 的列表信息。
     *
     * @return torrent 元数据列表
     */
    @GetMapping("/torrents")
    public Mono<ResponseEntity<JsonNode>> torrents() {
        return service.listTorrents()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.error("P2P torrents error", err);
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }
}
