package run.runnable.numfeelservice.service;

import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.Mark;
import org.yaml.snakeyaml.error.MarkedYAMLException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.controller.dto.YamlResponses.YamlParseResponse;
import run.runnable.numfeelservice.controller.dto.YamlResponses.YamlValueEntry;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.IntStream;

/**
 * YAML 地雷阵：用 SnakeYAML 在服务端真实解析用户提交的 YAML，
 * 逐键输出值的字符串渲染与类型，供前端与浏览器端 js-yaml 对照。
 * <p>
 * 响应式入口（{@link Mono}），解析任务调度到 boundedElastic。
 * 解析器每请求新建（{@link Yaml} 非线程安全）。SnakeYAML 2.x 默认拒绝
 * 任意类实例化（global tag 白名单化），用户输入无 RCE 风险。
 */
@Service
public class YamlCourtService {

    /** 响应中对外展示的解析器标识。 */
    public static final String PARSER_LABEL = "SnakeYAML 2.x / YAML 1.1";

    /** 类型判定分发表：按声明顺序做精确类匹配，命中即返回语义类型。 */
    private static final List<Map.Entry<Class<?>, Function<Object, String>>> TYPE_RULES = List.of(
            rule(Boolean.class, v -> "boolean"),
            rule(Integer.class, v -> "integer"),
            rule(Long.class, v -> "integer"),
            rule(BigInteger.class, v -> "integer"),
            rule(Double.class, v -> "float"),
            rule(Float.class, v -> "float"),
            rule(BigDecimal.class, v -> "float"),
            rule(Date.class, v -> "date"),
            rule(String.class, v -> "string")
    );

    private static Map.Entry<Class<?>, Function<Object, String>> rule(Class<?> type, Function<Object, String> name) {
        return new AbstractMap.SimpleImmutableEntry<>(type, name);
    }

    /**
     * 解析一段 YAML 文本。
     * <p>
     * 解析失败不会抛异常，而是返回 {@code ok=false} 的结果对象，
     * 由前端统一渲染两侧（浏览器 / 服务器）的报错对照。
     *
     * @param yamlText 原始 YAML 文本
     * @return 解析结果 DTO
     */
    public Mono<YamlParseResponse> parse(String yamlText) {
        return Mono.fromCallable(() -> doParse(yamlText == null ? "" : yamlText))
                .subscribeOn(Schedulers.boundedElastic());
    }

    private YamlParseResponse doParse(String text) {
        Yaml yaml = new Yaml(new LoaderOptions());
        try {
            return describe(yaml.load(text));
        } catch (MarkedYAMLException e) {
            return YamlParseResponse.builder()
                    .ok(false)
                    .error(singleLine(e))
                    .errorLine(problemLine(e))
                    .parser(PARSER_LABEL)
                    .build();
        } catch (Exception e) {
            return YamlParseResponse.builder()
                    .ok(false)
                    .error(singleLine(e))
                    .parser(PARSER_LABEL)
                    .build();
        }
    }

    /** 按根节点种类拆解为顶层条目列表。 */
    private YamlParseResponse describe(Object root) {
        String rootKind;
        List<YamlValueEntry> values;
        if (root == null) {
            rootKind = "null";
            values = List.of();
        } else if (root instanceof Map<?, ?> map) {
            rootKind = "mapping";
            values = map.entrySet().stream()
                    .map(entry -> toEntry(String.valueOf(entry.getKey()), entry.getValue()))
                    .toList();
        } else if (root instanceof List<?> list) {
            rootKind = "sequence";
            values = IntStream.range(0, list.size())
                    .mapToObj(i -> toEntry(String.valueOf(i), list.get(i)))
                    .toList();
        } else {
            rootKind = "scalar";
            values = List.of(toEntry("(root)", root));
        }
        return YamlParseResponse.builder()
                .ok(true)
                .parser(PARSER_LABEL)
                .rootKind(rootKind)
                .values(values)
                .build();
    }

    private YamlValueEntry toEntry(String key, Object value) {
        return new YamlValueEntry(key, render(value), typeName(value), javaType(value));
    }

    /** 值的字符串渲染：null 统一为 "null"，日期统一为 ISO-8601，BigDecimal 拒绝科学计数法。 */
    private String render(Object v) {
        if (v == null) {
            return "null";
        }
        if (v instanceof Date date) {
            return date.toInstant().toString();
        }
        if (v instanceof BigDecimal bd) {
            return bd.toPlainString();
        }
        return String.valueOf(v);
    }

    /** 语义类型标签，与前端 js-yaml 的归类一一对应；未命中分发表一律视为 object。 */
    private String typeName(Object v) {
        if (v == null) {
            return "null";
        }
        return TYPE_RULES.stream()
                .filter(entry -> entry.getKey().isInstance(v))
                .map(Map.Entry::getValue)
                .findFirst()
                .map(namer -> namer.apply(v))
                .orElse("object");
    }

    private String javaType(Object v) {
        return v == null ? "null" : v.getClass().getName();
    }

    /** 异常消息压成单行，去掉带上下文的多行部分。 */
    private String singleLine(Exception e) {
        String raw = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        int newline = raw.indexOf('\n');
        String line = newline >= 0 ? raw.substring(0, newline) : raw;
        return line.length() > 300 ? line.substring(0, 300) : line;
    }

    /** 从标记异常中取问题行号（1 起始）；拿不到返回 null。 */
    private Integer problemLine(MarkedYAMLException e) {
        Mark mark = e.getProblemMark();
        if (mark == null) {
            return null;
        }
        int line = mark.getLine() + 1;
        return line > 0 ? line : null;
    }
}
