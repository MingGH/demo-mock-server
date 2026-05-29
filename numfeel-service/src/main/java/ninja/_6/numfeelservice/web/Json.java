package ninja._6.numfeelservice.web;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Jackson 便捷工具，模拟旧版 Vert.x {@code JsonObject}/{@code JsonArray} 的读写手感，
 * 让从 Vert.x 迁移过来的 service / controller 代码保持最小改动。
 */
public final class Json {

    private Json() {
    }

    private static final JsonNodeFactory NF = JsonNodeFactory.instance;

    public static ObjectNode obj() {
        return NF.objectNode();
    }

    public static ArrayNode arr() {
        return NF.arrayNode();
    }

    // ── 读取（带默认值，空安全） ──────────────────────────────────────────

    public static Integer getInteger(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull() || !v.isNumber()) ? null : v.asInt();
    }

    public static int getInteger(JsonNode node, String field, int def) {
        Integer v = getInteger(node, field);
        return v == null ? def : v;
    }

    public static Long getLong(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull() || !v.isNumber()) ? null : v.asLong();
    }

    public static Double getDouble(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull() || !v.isNumber()) ? null : v.asDouble();
    }

    public static Double getDouble(JsonNode node, String field, double def) {
        Double v = getDouble(node, field);
        return v == null ? def : v;
    }

    public static String getString(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    public static String getString(JsonNode node, String field, String def) {
        String v = getString(node, field);
        return v == null ? def : v;
    }

    public static Boolean getBoolean(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull() || !v.isBoolean()) ? null : v.asBoolean();
    }

    public static JsonNode getObject(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v == null || v.isNull() || !v.isObject()) ? null : v;
    }

    public static ArrayNode getArray(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return (v instanceof ArrayNode a) ? a : null;
    }
}
