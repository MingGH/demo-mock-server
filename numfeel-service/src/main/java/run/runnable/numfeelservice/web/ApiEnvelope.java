package run.runnable.numfeelservice.web;

/**
 * 类型化成功响应 envelope：{@code {"status":200,"data":<T>}}。
 * <p>
 * 替代手搭 {@link tools.jackson.databind.JsonNode} 的做法，让 Controller 直接
 * 返回业务 DTO 对象，由 Spring 序列化，保留全站统一的 status/data 契约。
 *
 * @param status 状态码，成功恒为 200
 * @param data   业务 DTO
 * @param <T>    业务 DTO 类型
 */
public record ApiEnvelope<T>(int status, T data) {

    /** 构造一个 HTTP 200 的成功响应包。 */
    public static <T> ApiEnvelope<T> ok(T data) {
        return new ApiEnvelope<>(200, data);
    }
}