package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse;
import run.runnable.numfeelservice.controller.dto.YamlResponses.YamlValueEntry;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link YamlCourtService} 纯逻辑单测。
 * 所有断言值都来自 SnakeYAML 2.x 对 YAML 1.1 的真实解析行为。
 */
class YamlCourtServiceTest {

    private final YamlCourtService service = new YamlCourtService();

    private YamlParseResponse parse(String yaml) {
        return service.parse(yaml).block(java.time.Duration.ofSeconds(5));
    }

    private Optional<YamlValueEntry> entry(YamlParseResponse response, String key) {
        return response.values().stream()
                .filter(v -> v.key().equals(key))
                .findFirst();
    }

    // ── 经典地雷：解析成功路径 ──

    @Test
    void norway_no_resolves_to_boolean_false() {
        YamlParseResponse r = parse("country: no");
        assertTrue(r.ok());
        assertEquals("mapping", r.rootKind());
        YamlValueEntry e = entry(r, "country").orElseThrow();
        assertEquals("boolean", e.type());
        assertEquals("false", e.value());
    }

    @Test
    void sexagesimal_12_30_resolves_to_750() {
        YamlParseResponse r = parse("duration: 12:30");
        YamlValueEntry e = entry(r, "duration").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("750", e.value());
    }

    @Test
    void leading_zero_is_octal() {
        YamlParseResponse r = parse("zip: 02134");
        YamlValueEntry e = entry(r, "zip").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("1116", e.value());
    }

    @Test
    void hex_notation_resolves_to_decimal() {
        YamlParseResponse r = parse("port: 0x1F");
        YamlValueEntry e = entry(r, "port").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("31", e.value());
    }

    @Test
    void trailing_zero_float_drops_zero() {
        YamlParseResponse r = parse("version: 1.10");
        YamlValueEntry e = entry(r, "version").orElseThrow();
        assertEquals("float", e.type());
        assertEquals("1.1", e.value());
    }

    @Test
    void on_resolves_to_true() {
        YamlParseResponse r = parse("flag: on");
        YamlValueEntry e = entry(r, "flag").orElseThrow();
        assertEquals("boolean", e.type());
        assertEquals("true", e.value());
    }

    @Test
    void single_letter_y_stays_string_in_snakeyaml() {
        // 与 js-yaml 的关键分歧点：js-yaml 把 y 解析成 true，SnakeYAML 保留字符串
        YamlParseResponse r = parse("agree: y");
        YamlValueEntry e = entry(r, "agree").orElseThrow();
        assertEquals("string", e.type());
        assertEquals("y", e.value());
    }

    @Test
    void quoted_true_stays_string() {
        YamlParseResponse r = parse("env: 'true'");
        YamlValueEntry e = entry(r, "env").orElseThrow();
        assertEquals("string", e.type());
        assertEquals("true", e.value());
    }

    @Test
    void underscore_number_strips_separators() {
        YamlParseResponse r = parse("budget: 1_000_000");
        YamlValueEntry e = entry(r, "budget").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("1000000", e.value());
    }

    @Test
    void iso_date_resolves_to_date_object() {
        YamlParseResponse r = parse("published: 2026-08-29");
        YamlValueEntry e = entry(r, "published").orElseThrow();
        assertEquals("date", e.type());
        assertEquals("2026-08-29T00:00:00Z", e.value());
        assertEquals("java.util.Date", e.javaType());
    }

    @Test
    void long_in_range_stays_long_but_exact() {
        // 19 位订单号超出 JS Number 安全范围（JS 会丢精度），Java 侧用 Long 精确保留
        YamlParseResponse r = parse("order_id: 1234567890123456789");
        YamlValueEntry e = entry(r, "order_id").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("1234567890123456789", e.value());
        assertEquals("java.lang.Long", e.javaType());
    }

    @Test
    void beyond_long_range_promotes_to_big_integer() {
        // 超过 Long.MAX_VALUE 后 SnakeYAML 升格为 BigInteger
        YamlParseResponse r = parse("order_id: 123456789012345678901234567890");
        YamlValueEntry e = entry(r, "order_id").orElseThrow();
        assertEquals("integer", e.type());
        assertEquals("123456789012345678901234567890", e.value());
        assertEquals("java.math.BigInteger", e.javaType());
    }

    @Test
    void plain_scalar_stays_string() {
        YamlParseResponse r = parse("ip: 192.168.0.1");
        YamlValueEntry e = entry(r, "ip").orElseThrow();
        assertEquals("string", e.type());
        assertEquals("192.168.0.1", e.value());
    }

    @Test
    void tilde_resolves_to_null() {
        YamlParseResponse r = parse("key: ~");
        YamlValueEntry e = entry(r, "key").orElseThrow();
        assertEquals("null", e.type());
        assertEquals("null", e.value());
    }

    @Test
    void folded_scalar_folds_newline_into_space() {
        // > 折叠符：换行折成空格；文档末尾的最后换行被剥离（YAML 折叠规则）
        YamlParseResponse r = parse("poem: >\n  静夜思\n  床前明月光");
        YamlValueEntry e = entry(r, "poem").orElseThrow();
        assertEquals("string", e.type());
        assertEquals("静夜思 床前明月光", e.value());
    }

    @Test
    void merge_key_later_value_wins() {
        YamlParseResponse r = parse("defaults: &d\n  color: red\nitem:\n  <<: *d\n  color: blue");
        YamlValueEntry e = entry(r, "item").orElseThrow();
        assertEquals("object", e.type());
        assertTrue(e.value().contains("blue"));
        assertFalse(e.value().contains("red"));
    }

    // ── 重复键：记录 SnakeYAML 2.x 实际行为 ──

    @Test
    void duplicate_key_document_snakeyaml_behavior() {
        // SnakeYAML 2.x 默认 allowDuplicateKeys=true：后者覆盖前者，不报错。
        // js-yaml 4 则直接抛异常——这正是对照台要展示的解析器打架现场。
        YamlParseResponse r = parse("name: zhang\nname: li");
        if (r.ok()) {
            assertEquals("li", entry(r, "name").orElseThrow().value());
        } else {
            assertNotNull(r.error());
        }
    }

    // ── 解析失败路径 ──

    @Test
    void tab_indentation_fails_with_error_line() {
        YamlParseResponse r = parse("server:\n\tport: 8080");
        assertFalse(r.ok());
        assertNotNull(r.error());
        assertEquals(2, r.errorLine());
        assertTrue(r.values().isEmpty());
    }

    @Test
    void bad_structure_reports_error() {
        YamlParseResponse r = parse("key: [unclosed");
        assertFalse(r.ok());
        assertNotNull(r.error());
    }

    // ── 非常规根节点 ──

    @Test
    void empty_document_yields_null_root() {
        YamlParseResponse r = parse("");
        assertTrue(r.ok());
        assertEquals("null", r.rootKind());
        assertTrue(r.values().isEmpty());
    }

    @Test
    void sequence_root_is_described_by_index() {
        YamlParseResponse r = parse("- a\n- b");
        assertEquals("sequence", r.rootKind());
        assertEquals(2, r.values().size());
        assertEquals("a", r.values().get(0).value());
    }

    @Test
    void scalar_root_gets_root_entry() {
        YamlParseResponse r = parse("hello");
        assertEquals("scalar", r.rootKind());
        assertEquals("hello", r.values().get(0).value());
        assertEquals("(root)", r.values().get(0).key());
    }

    // ── 响应式契约 ──

    @Test
    void parse_is_reactive_and_completes() {
        StepVerifier.create(service.parse("country: no"))
                .assertNext(r -> assertTrue(r.ok()))
                .verifyComplete();
    }

    @Test
    void parse_null_input_is_tolerated() {
        StepVerifier.create(service.parse(null))
                .assertNext(r -> assertTrue(r.ok()))
                .verifyComplete();
    }

    // ── 元数据 ──

    @Test
    void success_response_carries_parser_label() {
        YamlParseResponse r = parse("a: 1");
        assertEquals(YamlCourtService.PARSER_LABEL, r.parser());
        assertNull(r.error());
        assertNull(r.errorLine());
    }
}
