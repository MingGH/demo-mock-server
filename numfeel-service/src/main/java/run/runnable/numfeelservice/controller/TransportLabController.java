package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.service.TransportLabService;
import run.runnable.numfeelservice.web.ApiResponse;

/**
 * WebSocket/HTTP 传输实验接口。
 */
@RestController
@RequestMapping("/transport-lab")
public class TransportLabController {

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
}
