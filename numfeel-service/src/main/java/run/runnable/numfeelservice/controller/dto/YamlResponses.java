package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/** YAML 地雷阵演示使用的响应 DTO。 */
public final class YamlResponses {

    private YamlResponses() {
    }

    /**
     * 顶层单条键值对的解析结果。
     *
     * @param key      键名（数组下标或 "(root)" 也走这个字段）
     * @param value    值的字符串渲染，null 渲染为 "null"，日期渲染为 ISO-8601
     * @param type     语义类型：null / boolean / integer / float / string / date / object
     * @param javaType 实际 Java 类型全名，如 java.lang.Boolean
     */
    public record YamlValueEntry(String key, String value, String type, String javaType) {
    }

    /**
     * SnakeYAML 解析对照结果。
     *
     * @param ok        true=解析成功；false=解析报错（此时 values 为空列表）
     * @param error     解析失败时的错误摘要（单行），成功时为 null
     * @param errorLine 解析失败时的问题行号（1 起始），未知时为 null
     * @param parser    解析器标识，如 "SnakeYAML 2.x / YAML 1.1"
     * @param rootKind  根节点种类：mapping / sequence / scalar / null
     * @param values    顶层条目列表，成功时非 null
     */
    public record YamlParseResponse(
            boolean ok,
            String error,
            Integer errorLine,
            String parser,
            String rootKind,
            List<YamlValueEntry> values
    ) {

        /** 起一个 Builder，避免 6 参位置构造的误读风险。 */
        public static Builder builder() {
            return new Builder();
        }

        /** {@link YamlParseResponse} 的流式构造器，字段名一一对应。 */
        public static final class Builder {
            private boolean ok;
            private String error;
            private Integer errorLine;
            private String parser;
            private String rootKind;
            private List<YamlValueEntry> values = List.of();

            private Builder() {
            }

            public Builder ok(boolean v) {
                this.ok = v;
                return this;
            }

            public Builder error(String v) {
                this.error = v;
                return this;
            }

            public Builder errorLine(Integer v) {
                this.errorLine = v;
                return this;
            }

            public Builder parser(String v) {
                this.parser = v;
                return this;
            }

            public Builder rootKind(String v) {
                this.rootKind = v;
                return this;
            }

            public Builder values(List<YamlValueEntry> v) {
                this.values = v == null ? List.of() : List.copyOf(v);
                return this;
            }

            public YamlParseResponse build() {
                return new YamlParseResponse(ok, error, errorLine, parser, rootKind, values);
            }
        }
    }
}
