package run.runnable.numfeelservice.web;

/**
 * 业务异常，携带 HTTP 状态码与提示信息。
 * 由 {@link GlobalExceptionHandler} 统一转换为 {@code {"status":xxx,"message":"..."}} 响应。
 */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(400, message);
    }

    public int status() {
        return status;
    }
}
