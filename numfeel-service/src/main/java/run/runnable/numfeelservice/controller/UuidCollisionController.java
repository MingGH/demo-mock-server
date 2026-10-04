package run.runnable.numfeelservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UuidCollisionRequests.AppendRequest;
import run.runnable.numfeelservice.controller.dto.UuidCollisionRequests.LookupRequest;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.AppendResponse;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.LookupResponse;
import run.runnable.numfeelservice.controller.dto.UuidCollisionResponses.StatusResponse;
import run.runnable.numfeelservice.service.UuidCollisionService;
import run.runnable.numfeelservice.web.ApiEnvelope;

/**
 * UUID 碰撞实验 HTTP 接口。
 */
@RestController
@RequestMapping("/uuid-collision")
public class UuidCollisionController {

    private final UuidCollisionService service;

    public UuidCollisionController(UuidCollisionService service) {
        this.service = service;
    }

    /**
     * 查询 MySQL 真实行数和基础实验目标。
     *
     * @return 状态响应
     */
    @GetMapping("/status")
    public Mono<ApiEnvelope<StatusResponse>> status() {
        return service.status().map(ApiEnvelope::ok);
    }

    /**
     * 现场追加一批 UUID。
     *
     * @param request 请求体，包含 count 字段
     * @return 追加结果
     */
    @PostMapping("/append")
    public Mono<ApiEnvelope<AppendResponse>> append(@RequestBody(required = false) AppendRequest request) {
        int count = request == null || request.count() == null ? 0 : request.count();
        return service.append(count).map(ApiEnvelope::ok);
    }

    /**
     * 用主键索引查询某个 UUID 是否已在当前实验表中。
     *
     * @param request 请求体，包含 uuid 字段
     * @return 查询结果
     */
    @PostMapping("/lookup")
    public Mono<ApiEnvelope<LookupResponse>> lookup(@RequestBody(required = false) LookupRequest request) {
        String uuid = request == null ? null : request.uuid();
        return service.lookup(uuid).map(ApiEnvelope::ok);
    }
}
