package run.runnable.numfeelservice.controller;

import tools.jackson.databind.ObjectMapper;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.GeneratorQuery;
import run.runnable.numfeelservice.generator.ChineseNameGenerator;
import run.runnable.numfeelservice.generator.FakeDataGenerator;
import run.runnable.numfeelservice.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * 输出为 CollectorList 批量 JSON 数组，避免流式响应在中途错误时断裂。
 */
@RestController
public class GeneratorController {

    private static final Logger log = LoggerFactory.getLogger(GeneratorController.class);

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
        return fakeDataGenerator.generate(total)
                .map(this::toJson)
                .collectList()
                .flatMapMany(items -> {
                    StringBuilder sb = new StringBuilder("[");
                    for (int i = 0; i < items.size(); i++) {
                        if (i > 0) sb.append(",");
                        sb.append(items.get(i));
                    }
                    sb.append("]");
                    return Flux.just(sb.toString());
                })
                .onErrorResume(err -> {
                    log.error("mock generation failed for n={}: {}", total, err.getMessage());
                    return Flux.just("{\"status\":500,\"message\":\"Generation failed\"}");
                });
    }

    @GetMapping(value = "/chinese-names", produces = MediaType.APPLICATION_JSON_VALUE)
    public Flux<String> chineseNames(@ModelAttribute GeneratorQuery query) {
        int total = validate(query == null ? null : query.n(), NAME_MIN, NAME_MAX);
        return chineseNameGenerator.generate(total)
                .map(name -> "\"" + name.replace("\"", "\\\"") + "\"")
                .collectList()
                .flatMapMany(items -> {
                    StringBuilder sb = new StringBuilder("[");
                    for (int i = 0; i < items.size(); i++) {
                        if (i > 0) sb.append(",");
                        sb.append(items.get(i));
                    }
                    sb.append("]");
                    return Flux.just(sb.toString());
                })
                .onErrorResume(err -> {
                    log.error("chinese-names generation failed for n={}: {}", total, err.getMessage());
                    return Flux.just("{\"status\":500,\"message\":\"Generation failed\"}");
                });
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

    private String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize generator item", e);
        }
    }
}

