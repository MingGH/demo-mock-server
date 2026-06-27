package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.service.TransportLabService;
import run.runnable.numfeelservice.web.ApiResponse;

import java.time.Instant;

/**
 * WebSocket/HTTP 传输实验接口。
 */
@RestController
@RequestMapping("/transport-lab")
public class TransportLabController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final TransportLabService transportLabService;

    public TransportLabController(TransportLabService transportLabService) {
        this.transportLabService = transportLabService;
    }

    /**
     * 返回当前参数下的 HTTP 与 WebSocket 成本快照。
     *
     * @param query 查询参数
     * @return 统一响应格式的成本快照
     */
    @GetMapping(value = "/snapshot", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> snapshot(@ModelAttribute TransportLabQuery query) {
        return Mono.fromSupplier(() -> ApiResponse.ok(transportLabService.snapshot(query)));
    }

    /**
     * 测速端点：返回指定大小的 JSON 负载，附服务端时间戳供前端计算 RTT 和下载速度。
     *
     * @param size 目标响应体字节数（默认 1024，上限 65536）
     * @return 统一响应格式的测速结果
     */
    @GetMapping(value = "/benchmark", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> benchmark(
            @RequestParam(defaultValue = "1024") int size) {
        return Mono.fromSupplier(() -> {
            var clampedSize = Math.max(64, Math.min(size, 65536));
            var node = MAPPER.createObjectNode();
            node.put("serverTime", Instant.now().toEpochMilli());
            node.put("size", clampedSize);

            // 填充数据使响应接近目标大小
            var payload = new StringBuilder();
            var chunk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"; // 62 chars
            while (payload.length() < clampedSize - 128) {
                payload.append(chunk);
            }
            if (payload.length() > clampedSize - 128) {
                payload.setLength(clampedSize - 128);
            }
            node.put("payload", payload.toString());
            return ApiResponse.ok(node);
        });
    }
}
