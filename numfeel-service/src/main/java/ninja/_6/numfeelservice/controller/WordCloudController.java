package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.service.WordCloudService;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    public Mono<ResponseEntity<JsonNode>> wordCloud(
            @RequestParam(name = "search", required = false) String search) {
        return Mono.fromCallable(service::getOrLoad)
                .subscribeOn(Schedulers.boundedElastic())
                .map(data -> respond(data, search))
                .onErrorResume(err -> {
                    log.error("Failed to load word cloud data", err);
                    return Mono.just(ResponseEntity.status(500)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(Json.obj().put("error", err.getMessage())));
                });
    }

    private ResponseEntity<JsonNode> respond(WordCloudService.WordCloudData data, String search) {
        if (search != null && !search.isBlank()) {
            String word = search.trim();
            int count = data.fullCounts().getOrDefault(word, 0);
            boolean inTop300 = false;
            for (int i = 0; i < data.top300().size(); i++) {
                if (word.equals(data.top300().get(i).get("name").asText())) {
                    inTop300 = true;
                    break;
                }
            }
            ObjectNode o = Json.obj();
            o.put("word", word);
            o.put("count", count);
            o.put("inTop300", inTop300);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(o);
        }
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(data.top300());
    }
}
