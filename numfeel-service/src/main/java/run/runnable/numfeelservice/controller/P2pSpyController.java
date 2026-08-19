package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.P2pSpyService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * P2P 隐私透视镜 HTTP 处理器。
 * <p>
 * GET /p2p/peers          — 获取指定 torrent 的模拟 peer 列表及地理分布
 * GET /p2p/torrents       — 获取预设 torrent 列表
 */
@RestController
@RequestMapping("/p2p")
public class P2pSpyController {

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
    public Mono<ApiEnvelope<P2pSpyService.PeerDiscoveryResult>> peers(
            @RequestParam(value = "index", defaultValue = "0") int index) {
        return service.getPeers(index)
                .map(ApiEnvelope::ok);
    }

    /**
     * 获取所有预设 torrent 的列表信息。
     *
     * @return torrent 元数据列表
     */
    @GetMapping("/torrents")
    public Mono<ApiEnvelope<List<P2pSpyService.TorrentSummary>>> torrents() {
        return service.listTorrents()
                .map(ApiEnvelope::ok);
    }
}
