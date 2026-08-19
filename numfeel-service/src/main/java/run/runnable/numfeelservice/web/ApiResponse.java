package run.runnable.numfeelservice.web;

import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.CacheInfo;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 成功响应：{@code {"status":200,"data":<data>}}，HTTP 200。 */
    public static ResponseEntity<JsonNode> ok(Object data) {
        ObjectNode body = NF.objectNode();
        body.put("status", 200);
        body.set("data", data == null ? NF.nullNode() : MAPPER.valueToTree(data));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }

    /**
     * 类型化成功响应：返回 {@link ApiEnvelope}{@code <T>}（{@code {"status":200,"data":<T>}}），
     * 由 Spring 序列化业务 DTO，而不是手工组装 JsonNode。
     *
     * @param data 业务 DTO
     * @param <T>  业务 DTO 类型
     */
    public static <T> ResponseEntity<ApiEnvelope<T>> okDto(T data) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(ApiEnvelope.ok(data));
    }

    /**
     * 带缓存元信息的成功响应：
     * {@code {"status":200,"data":<data>,"cache":{...}}}。
     * 用于支持前端展示「数据来自缓存 · 剩 X 分钟刷新」。
     */
    public static ResponseEntity<JsonNode> okWithCache(Object data, CacheInfo cache) {
        ObjectNode body = NF.objectNode();
        body.put("status", 200);
        body.set("data", data == null ? NF.nullNode() : MAPPER.valueToTree(data));
        ObjectNode cacheNode = NF.objectNode();
        cacheNode.put("cached", cache.cached());
        cacheNode.put("cachedAt", cache.cachedAt());
        cacheNode.put("expiresAt", cache.expiresAt());
        cacheNode.put("ttlSeconds", cache.ttlSeconds());
        body.set("cache", cacheNode);
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

    /** 直接返回任意对象作为响应体，HTTP 200。 */
    public static ResponseEntity<JsonNode> raw(Object body) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(body == null ? NF.nullNode() : MAPPER.valueToTree(body));
    }
}
