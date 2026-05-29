package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * 量子随机数代理。
 * GET /quantum/numbers   — 调用 ANU QRNG（失败降级为伪随机）
 * GET /quantum/available — 查询上游可用量
 */
@RestController
@RequestMapping("/quantum")
public class QuantumController {

    private static final Logger log = LoggerFactory.getLogger(QuantumController.class);

    private final WebClient webClient;
    private final String apiToken;

    public QuantumController(@Qualifier("ninjaApiWebClient") WebClient webClient,
                             @Value("${ninja.api.token:}") String apiToken) {
        this.webClient = webClient;
        this.apiToken = apiToken;
        if (apiToken == null || apiToken.isEmpty()) {
            log.warn("NINJA_API_TOKEN (ninja.api.token) not set");
        }
    }

    @GetMapping(value = "/numbers", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> numbers(
            @RequestParam(required = false) String count,
            @RequestParam(required = false) String min,
            @RequestParam(required = false) String max,
            @RequestParam(required = false) String unique) {
        int countVal = parseInt(count, 10);
        int minVal = parseInt(min, 1);
        int maxVal = parseInt(max, 100);
        boolean uniqueVal = "true".equalsIgnoreCase(unique);

        if (countVal < 1 || countVal > 2000) {
            return Mono.just(error(400, "count must be between 1 and 2000"));
        }
        if (minVal >= maxVal) {
            return Mono.just(error(400, "min must be less than max"));
        }
        if (uniqueVal && (maxVal - minVal + 1) < countVal) {
            return Mono.just(error(400, "range too small for unique numbers"));
        }

        int requestCount = uniqueVal ? Math.min(countVal * 3, 2000) : countVal;

        return webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/random/numbers")
                        .queryParam("count", requestCount)
                        .queryParam("min", minVal)
                        .queryParam("max", maxVal).build())
                .header("X-Api-Token", apiToken)
                .retrieve()
                .bodyToMono(ArrayNode.class)
                .map(numbers -> {
                    List<Integer> result = new ArrayList<>();
                    if (uniqueVal) {
                        Set<Integer> seen = new LinkedHashSet<>();
                        for (int i = 0; i < numbers.size() && seen.size() < countVal; i++) {
                            seen.add(numbers.get(i).asInt());
                        }
                        result.addAll(seen);
                        Random random = new Random();
                        while (result.size() < countVal) {
                            int num = random.nextInt(maxVal - minVal + 1) + minVal;
                            if (!result.contains(num)) result.add(num);
                        }
                    } else {
                        for (int i = 0; i < Math.min(numbers.size(), countVal); i++) {
                            result.add(numbers.get(i).asInt());
                        }
                    }
                    return success(result, "quantum", "ANU QRNG");
                })
                .onErrorResume(err -> {
                    log.error("Quantum API error: {}", err.getMessage());
                    return Mono.just(fallback(countVal, minVal, maxVal, uniqueVal));
                });
    }

    @GetMapping(value = "/available", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> available() {
        return webClient.get()
                .uri("/random/available")
                .header("X-Api-Token", apiToken)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(body -> ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body))
                .onErrorResume(err -> Mono.just(error(500, err.getMessage())));
    }

    private ResponseEntity<JsonNode> fallback(int count, int min, int max, boolean unique) {
        Random random = new Random();
        List<Integer> result = new ArrayList<>();
        if (unique) {
            Set<Integer> seen = new HashSet<>();
            while (seen.size() < count) {
                seen.add(random.nextInt(max - min + 1) + min);
            }
            result.addAll(seen);
        } else {
            for (int i = 0; i < count; i++) {
                result.add(random.nextInt(max - min + 1) + min);
            }
        }
        return success(result, "pseudo", "Java Random (fallback)");
    }

    private ResponseEntity<JsonNode> success(List<Integer> result, String source, String provider) {
        ArrayNode data = Json.arr();
        result.forEach(data::add);
        ObjectNode body = Json.obj();
        body.put("status", 200);
        body.set("data", data);
        body.put("source", source);
        body.put("provider", provider);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private int parseInt(String value, int def) {
        if (value == null || value.isEmpty()) return def;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private ResponseEntity<JsonNode> error(int status, String message) {
        ObjectNode body = Json.obj();
        body.put("status", status);
        body.put("message", message);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
