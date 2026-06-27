package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HttpBinaryDemoService 纯逻辑测试。
 */
class HttpBinaryDemoServiceTest {

    private final HttpBinaryDemoService service = new HttpBinaryDemoService();
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();
    // MessagePack 序列化/反序列化必须用 com.fasterxml.jackson（tools.jackson 不兼容 msgpack-jackson）
    private static final com.fasterxml.jackson.databind.ObjectMapper CF_MSG_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper(new org.msgpack.jackson.dataformat.MessagePackFactory());

    @Test
    void toJsonText_returnsNonEmptyString() {
        String json = service.toJsonText();
        assertNotNull(json);
        assertFalse(json.isBlank());
    }

    @Test
    void toJsonText_isValidJson() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        assertNotNull(root);
        assertTrue(root.has("users"));
        assertTrue(root.has("posts"));
        assertTrue(root.has("generated_at"));
        assertTrue(root.has("description"));
    }

    @Test
    void toJsonText_containsExpectedUserCount() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        assertEquals(50, root.get("users").size());
    }

    @Test
    void toJsonText_containsExpectedPostCount() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        assertEquals(80, root.get("posts").size());
    }

    @Test
    void toJsonText_postsHaveRequiredFields() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        for (JsonNode post : root.get("posts")) {
            assertTrue(post.has("id"));
            assertTrue(post.has("type"));
            assertTrue(post.has("author_id"));
            assertTrue(post.has("content"));
            assertTrue(post.has("stats"));
            assertTrue(post.has("tags"));
        }
    }

    @Test
    void toJsonText_containsMultiplePostTypes() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        var types = new java.util.HashSet<String>();
        for (JsonNode post : root.get("posts")) {
            types.add(post.get("type").asText());
        }
        // 至少包含 text、image、poll、repost 中的多种
        assertTrue(types.size() >= 3, "至少包含3种不同类型的动态, 实际: " + types);
    }

    @Test
    void toJsonText_usersHaveRequiredFields() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        for (JsonNode user : root.get("users")) {
            assertTrue(user.has("id"));
            assertTrue(user.has("nickname"));
            assertTrue(user.has("role"));
            assertTrue(user.has("bio"));
            assertTrue(user.has("stats"));
            assertTrue(user.has("avatar_thumb_base64"));
        }
    }

    @Test
    void toJsonText_pollPostHasOptions() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        JsonNode pollPost = null;
        for (JsonNode post : root.get("posts")) {
            if ("poll".equals(post.get("type").asText())) {
                pollPost = post;
                break;
            }
        }
        assertNotNull(pollPost, "应包含一条投票动态");
        assertTrue(pollPost.has("poll_options"));
        assertEquals(5, pollPost.get("poll_options").size());
        assertTrue(pollPost.has("total_votes"));
    }

    @Test
    void toJsonText_repostHasQuotedPost() throws Exception {
        String json = service.toJsonText();
        JsonNode root = JSON_MAPPER.readTree(json);
        JsonNode repost = null;
        for (JsonNode post : root.get("posts")) {
            if ("repost".equals(post.get("type").asText())) {
                repost = post;
                break;
            }
        }
        assertNotNull(repost, "应包含一条转发动态");
        assertTrue(repost.has("reposted_post"));
        JsonNode quoted = repost.get("reposted_post");
        assertTrue(quoted.has("author_nickname"), "引用帖应有作者昵称");
        assertTrue(quoted.has("content"));
    }

    @Test
    void toJsonText_containsUnicodeAndEmoji() throws Exception {
        String json = service.toJsonText();
        // 应包含 emoji 和全角字母
        assertTrue(json.contains("🚀"), "应包含 emoji");
        assertTrue(json.contains("👨"), "应包含 emoji");
        // 全角字母 Ａ (U+FF21)，即动态中提到的 "全角字母ＡＢＣ"
        assertTrue(json.contains("全角字母"), "应包含全角字母说明");
    }

    // ── 二进制相关 ──

    @Test
    void toBinary_returnsNonEmptyArray() {
        byte[] bytes = service.toBinary();
        assertNotNull(bytes);
        assertTrue(bytes.length > 0);
    }

    @Test
    void toBinary_decodesToValidStructure() throws Exception {
        byte[] bytes = service.toBinary();
        var root = CF_MSG_MAPPER.readTree(bytes);
        assertNotNull(root);
        assertTrue(root.has("users"));
        assertTrue(root.has("posts"));
    }

    @Test
    void binaryAndJson_containSameUserCount() throws Exception {
        byte[] binary = service.toBinary();
        String json = service.toJsonText();

        var binRoot = CF_MSG_MAPPER.readTree(binary);
        JsonNode jsonRoot = JSON_MAPPER.readTree(json);

        assertEquals(jsonRoot.get("users").size(), binRoot.get("users").size());
    }

    @Test
    void binaryAndJson_containSamePostCount() throws Exception {
        byte[] binary = service.toBinary();
        String json = service.toJsonText();

        var binRoot = CF_MSG_MAPPER.readTree(binary);
        JsonNode jsonRoot = JSON_MAPPER.readTree(json);

        assertEquals(jsonRoot.get("posts").size(), binRoot.get("posts").size());
    }

    @Test
    void binaryAndJson_postIdsMatch() throws Exception {
        byte[] binary = service.toBinary();
        String json = service.toJsonText();

        var jsonIds = new java.util.ArrayList<Integer>();
        JsonNode jsonRoot = JSON_MAPPER.readTree(json);
        for (JsonNode p : jsonRoot.get("posts")) {
            jsonIds.add(p.get("id").asInt());
        }

        var binIds = new java.util.ArrayList<Integer>();
        var binRoot = CF_MSG_MAPPER.readTree(binary);
        for (var p : binRoot.get("posts")) {
            binIds.add(p.get("id").asInt());
        }

        assertEquals(jsonIds, binIds, "JSON和二进制中的动态ID应完全一致");
    }

    @Test
    void binaryIsSmallerThanJson() throws Exception {
        byte[] binary = service.toBinary();
        String json = service.toJsonText();
        int jsonBytes = json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;

        assertTrue(binary.length < jsonBytes,
                "二进制应比JSON文本小, binary=" + binary.length + ", json=" + jsonBytes);
    }

    @Test
    void toJsonText_isDeterministic() {
        String first = service.toJsonText();
        String second = service.toJsonText();
        assertEquals(first, second, "多次调用应返回相同结果");
    }

    @Test
    void toBinary_isDeterministic() {
        byte[] first = service.toBinary();
        byte[] second = service.toBinary();
        assertArrayEquals(first, second, "多次调用应返回相同结果");
    }
}
