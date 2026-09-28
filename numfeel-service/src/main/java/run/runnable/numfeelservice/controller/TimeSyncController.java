package run.runnable.numfeelservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.TimeSyncResponse;
import run.runnable.numfeelservice.service.TimeSyncService;
import run.runnable.numfeelservice.web.ApiEnvelope;

/**
 * 时间同步接口：为 gps-time 演示提供服务端已按上游 NTP 校正的 t2/t3，供前端做 HTTP 近似测量。
 * <p>
 * GET /time/sync → {@code {"status":200,"data":{recvEpochMillis,sendEpochMillis,source,ntp,unavailableReason}}}
 */
@RestController
@RequestMapping("/time")
public class TimeSyncController {

    private final TimeSyncService service;

    public TimeSyncController(TimeSyncService service) {
        this.service = service;
    }

    /**
     * 取一次时间同步结果。
     *
     * @return {@link TimeSyncResponse}；上游不可用时 source=unavailable（HTTP 仍 200）
     */
    @GetMapping("/sync")
    public Mono<ApiEnvelope<TimeSyncResponse>> sync() {
        return service.sync().map(ApiEnvelope::ok);
    }
}