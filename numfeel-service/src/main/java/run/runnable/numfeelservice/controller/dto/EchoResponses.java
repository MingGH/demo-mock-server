package run.runnable.numfeelservice.controller.dto;

/**
 * Echo 基准接口的响应 DTO。
 */
public final class EchoResponses {

    private EchoResponses() {
    }

    /**
     * 单机并发基准的固定应答体。
     *
     * @param message 固定返回 "ok"，不含任何业务处理
     */
    public record EchoResponse(String message) {
    }
}
