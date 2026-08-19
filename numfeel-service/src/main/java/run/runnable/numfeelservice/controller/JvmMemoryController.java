package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.JvmMemoryService;
import run.runnable.numfeelservice.web.ApiEnvelope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.MemoryResponses.JvmMemorySnapshot;

/**
 * JVM 内存解剖接口。
 * <p>
 * GET /jvm-memory — 返回「当前正在运行的服务」实时的内存快照，用于在
 * 「Java 是不是真的吃内存」演示页里展示堆 / Metaspace / Code Cache /
 * 线程栈 / RSS 等各项占用的真实分布。
 * <p>
 * 返回类型化为 {@link ApiEnvelope}{@code <JvmMemorySnapshot>}，由 Spring
 * 直接序列化业务 DTO；异常交给 {@code GlobalExceptionHandler} 统一处理。
 */
@RestController
@RequestMapping("/jvm-memory")
public class JvmMemoryController {

    private final JvmMemoryService service;

    public JvmMemoryController(JvmMemoryService service) {
        this.service = service;
    }

    /**
     * 返回一次 JVM 内存快照。
     *
     * @return {@code {"status":200,"data":<JvmMemorySnapshot>}}；出错时由全局异常处理器返回
     */
    @GetMapping
    public Mono<ApiEnvelope<JvmMemorySnapshot>> snapshot() {
        return service.snapshot()
                .map(ApiEnvelope::ok);
    }
}