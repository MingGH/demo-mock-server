package ninja._6.numfeelservice.web;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * 统一响应封装工具。
 * <p>
 * 旧版 Vert.x 后端的响应格式为 {@code {"status":200,"data":...}}（成功）
 * 与 {@code {"status":xxx,"message":"..."}}（错误），这里保持完全一致，
 * 以便前端无需改动。
 */
public final class ApiResponse {

    private ApiResponse() {
    }

    private static final JsonNodeFactory NF = JsonNodeFactory.instance;

    /** 成功响应：{@code {"status":200,"data":<data>}}，HTTP 200。 */
    public static ResponseEntity<JsonNode> ok(JsonNode data) {
        ObjectNode body = NF.objectNode();
        body.put("status", 200);
        body.set("data", data == null ? NF.nullNode() : data);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    /** 错误响应：{@code {"status":<status>,"message":<msg>}}，HTTP 状态码与 status 一致。 */
    public static ResponseEntity<JsonNode> error(int status, String message) {
        ObjectNode body = NF.objectNode();
        body.put("status", status);
        body.put("message", message);
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    /** 直接返回任意 JSON 节点作为响应体，HTTP 200（用于不带 status 包裹的接口，如词云）。 */
    public static ResponseEntity<JsonNode> raw(JsonNode body) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }
}
