package run.runnable.numfeelservice.controller.dto;

/**
 * 多个控制器共享的简单响应 DTO。
 */
public final class CommonResponses {

    private CommonResponses() {
    }

    /**
     * 通用提交成功响应。
     *
     * @param submitted 是否提交成功
     */
    public record SubmitAckResponse(boolean submitted) {
    }

    /**
     * 通用清空成功响应。
     *
     * @param cleared 是否清空成功
     */
    public record ClearAckResponse(boolean cleared) {
    }
}
