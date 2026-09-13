package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.EchoResponses.EchoResponse;
import run.runnable.numfeelservice.web.ApiEnvelope;

/**
 * 单机并发基准接口：不做任何业务处理，固定返回成功应答。
 * <p>
 * 刻意保持最小：无数据库、无缓存、无外部调用，链路上唯一的成本是
 * Netty 事件循环、HTTP 编解码与 Jackson 序列化。
 * 压测时通过 {@code numfeel.rate-limit.enabled=false} 关闭限流过滤器。
 */
@RestController
public class EchoController {

    /**
     * 固定返回 {@code {"status":200,"data":{"message":"ok"}}}。
     *
     * @return 固定成功应答
     */
    @GetMapping(value = "/echo", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ApiEnvelope<EchoResponse>> echo() {
        return Mono.just(ApiEnvelope.ok(new EchoResponse("ok")));
    }
}
