package run.runnable.numfeelservice.web;

import tools.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

/**
 * 全局异常处理：把业务异常和未捕获异常统一映射成
 * {@code {"status":xxx,"message":"..."}} 的响应格式，与旧版 Vert.x 后端保持一致。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<JsonNode> handleApi(ApiException ex) {
        return ApiResponse.error(ex.status(), ex.getMessage());
    }

    /** 请求体不是合法 JSON / 缺失等，归类为 400。 */
    @ExceptionHandler(ServerWebInputException.class)
    public ResponseEntity<JsonNode> handleInput(ServerWebInputException ex) {
        return ApiResponse.error(400, "Invalid request");
    }

    /**
     * 框架抛出的、已带状态码的异常（如静态资源 404）直接透传状态码，
     * 不要被下面的 catch-all 误判为 500。
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<JsonNode> handleStatus(ResponseStatusException ex) {
        int status = ex.getStatusCode().value();
        return ApiResponse.error(status, ex.getReason() != null ? ex.getReason() : "Error");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<JsonNode> handleOther(Exception ex) {
        log.error("Unhandled error", ex);
        return ApiResponse.error(500, "Internal error");
    }
}
