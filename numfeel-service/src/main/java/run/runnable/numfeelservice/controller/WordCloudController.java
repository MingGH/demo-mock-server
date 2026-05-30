package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.WordCloudQuery;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.RawErrorResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.WordCloudEntryResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.WordCloudSearchResponse;
import run.runnable.numfeelservice.service.WordCloudService;
import run.runnable.numfeelservice.web.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 词云 HTTP 处理器。
 * GET /word-cloud[?search=词]
 */
@RestController
public class WordCloudController {

    private static final Logger log = LoggerFactory.getLogger(WordCloudController.class);

    private final WordCloudService service;

    public WordCloudController(WordCloudService service) {
        this.service = service;
    }

    @GetMapping(value = "/word-cloud", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> wordCloud(@ModelAttribute WordCloudQuery query) {
        return Mono.fromCallable(service::getOrLoad)
                .subscribeOn(Schedulers.boundedElastic())
                .map(data -> respond(data, query == null ? null : query.search()))
                .onErrorResume(err -> {
                    log.error("Failed to load word cloud data", err);
                    return Mono.just(ResponseEntity.status(500)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(ApiResponse.raw(new RawErrorResponse(err.getMessage())).getBody()));
                });
    }

    private ResponseEntity<JsonNode> respond(WordCloudService.WordCloudData data, String search) {
        if (search != null && !search.isBlank()) {
            String word = search.trim();
            int count = data.fullCounts().getOrDefault(word, 0);
            boolean inTop300 = data.top300().stream().map(WordCloudEntryResponse::name).anyMatch(word::equals);
            return ApiResponse.raw(new WordCloudSearchResponse(word, count, inTop300));
        }
        return ApiResponse.raw(data.top300());
    }
}
