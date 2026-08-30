package run.runnable.numfeelservice.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.YamlRequests.YamlParseRequest;
import run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse;
import run.runnable.numfeelservice.service.YamlCourtService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import run.runnable.numfeelservice.web.ApiException;

/**
 * YAML 地雷阵 HTTP 处理器。
 * POST /yaml-court/parse — 服务端 SnakeYAML 解析对照。
 */
@RestController
@RequestMapping("/yaml-court")
public class YamlCourtController {

    /** 请求体上限（字符数），防止超大载荷拖垮解析；3MB 级 code point 限制由 SnakeYAML 兜底。 */
    private static final int MAX_YAML_LENGTH = 64_000;

    private final YamlCourtService service;

    public YamlCourtController(YamlCourtService service) {
        this.service = service;
    }

    @PostMapping("/parse")
    public Mono<ApiEnvelope<YamlParseResponse>> parse(@RequestBody(required = false) YamlParseRequest request) {
        if (request == null || request.yaml() == null || request.yaml().isBlank()) {
            throw ApiException.badRequest("YAML text is required");
        }
        if (request.yaml().length() > MAX_YAML_LENGTH) {
            throw ApiException.badRequest("YAML too large (max 64KB)");
        }
        return service.parse(request.yaml())
                .map(ApiEnvelope::ok);
    }
}
