package run.runnable.numfeelservice.controller;

import tools.jackson.databind.ObjectMapper;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.GeneratorQuery;
import run.runnable.numfeelservice.generator.ChineseNameGenerator;
import run.runnable.numfeelservice.generator.FakeDataGenerator;
import run.runnable.numfeelservice.web.ApiException;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * 数据生成接口：
 * <ul>
 *   <li>GET /mock?n=...           — 假数据（200 ≤ n ≤ 1,000,000）</li>
 *   <li>GET /chinese-names?n=...  — 中文名（1 ≤ n ≤ 100,000）</li>
 * </ul>
 * 输出为一个 JSON 数组，使用流式拼接（保留旧版的并行生成 + 流式响应特性）。
 */
@RestController
public class GeneratorController {

    private static final int MOCK_MIN = 200;
    private static final int MOCK_MAX = 1_000_000;
    private static final int NAME_MIN = 1;
    private static final int NAME_MAX = 100_000;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final FakeDataGenerator fakeDataGenerator;
    private final ChineseNameGenerator chineseNameGenerator;

    public GeneratorController(FakeDataGenerator fakeDataGenerator,
                               ChineseNameGenerator chineseNameGenerator) {
        this.fakeDataGenerator = fakeDataGenerator;
        this.chineseNameGenerator = chineseNameGenerator;
    }

    @GetMapping(value = "/mock", produces = MediaType.APPLICATION_JSON_VALUE)
    public Flux<String> mock(@ModelAttribute GeneratorQuery query) {
        int total = validate(query == null ? null : query.n(), MOCK_MIN, MOCK_MAX);
        Flux<String> items = fakeDataGenerator.generate(total).map(this::toJson);
        return asJsonArray(items);
    }

    @GetMapping(value = "/chinese-names", produces = MediaType.APPLICATION_JSON_VALUE)
    public Flux<String> chineseNames(@ModelAttribute GeneratorQuery query) {
        int total = validate(query == null ? null : query.n(), NAME_MIN, NAME_MAX);
        Flux<String> items = chineseNameGenerator.generate(total)
                .map(name -> "\"" + name.replace("\"", "\\\"") + "\"");
        return asJsonArray(items);
    }

    private int validate(String n, int min, int max) {
        if (n == null || !n.matches("\\d+")) {
            throw ApiException.badRequest("Invalid parameter 'n' (" + min + " <= n <= " + max + ")");
        }
        int value = Integer.parseInt(n);
        if (value < min || value > max) {
            throw ApiException.badRequest("Invalid parameter 'n' (" + min + " <= n <= " + max + ")");
        }
        return value;
    }

    /** 把元素字符串流拼成一个 JSON 数组：{@code [a,b,c]}。 */
    private Flux<String> asJsonArray(Flux<String> items) {
        var counter = new java.util.concurrent.atomic.AtomicLong(0);
        Flux<String> body = items.map(item -> counter.getAndIncrement() == 0 ? item : "," + item);
        return Flux.concat(Flux.just("["), body, Flux.just("]"));
    }

    private String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize generator item", e);
        }
    }
}
