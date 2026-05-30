package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.service.BlockIpService;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * BlockIP 统计代理。
 * GET /blockip/stats — 返回带 5 分钟缓存的聚合统计。
 */
@RestController
@RequestMapping("/blockip")
public class BlockIpController {

    private static final Logger log = LoggerFactory.getLogger(BlockIpController.class);

    private final BlockIpService service;

    public BlockIpController(BlockIpService service) {
        this.service = service;
    }

    @GetMapping(value = "/stats", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(this::ok)
                .onErrorResume(err -> {
                    log.error("BlockIP stats error: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    private ResponseEntity<JsonNode> ok(Object data) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "public, max-age=300")
                .body(ApiResponse.raw(data).getBody());
    }
}
