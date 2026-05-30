package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.QuantumNumbersQuery;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.QuantumNumbersResponse;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
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
    public Mono<ResponseEntity<JsonNode>> numbers(@ModelAttribute QuantumNumbersQuery query) {
        int countVal = parseInt(query == null ? null : query.count(), 10);
        int minVal = parseInt(query == null ? null : query.min(), 1);
        int maxVal = parseInt(query == null ? null : query.max(), 100);
        boolean uniqueVal = "true".equalsIgnoreCase(query == null ? null : query.unique());

        if (countVal < 1 || countVal > 2000) {
            return Mono.just(ApiResponse.error(400, "count must be between 1 and 2000"));
        }
        if (minVal >= maxVal) {
            return Mono.just(ApiResponse.error(400, "min must be less than max"));
        }
        if (uniqueVal && (maxVal - minVal + 1) < countVal) {
            return Mono.just(ApiResponse.error(400, "range too small for unique numbers"));
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
                .exchangeToMono(response ->
                        response.bodyToMono(JsonNode.class)
                                .map(ApiResponse::raw)
                )
                .onErrorResume(err -> Mono.just(ApiResponse.error(500, err.getMessage())));
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
        return ApiResponse.raw(new QuantumNumbersResponse(200, result, source, provider));
    }

    private int parseInt(String value, int def) {
        if (value == null || value.isEmpty()) return def;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
