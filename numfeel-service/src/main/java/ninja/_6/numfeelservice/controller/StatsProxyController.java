package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Set;

/**
 * 统计代理 Handler：转发计数到 api.996.ninja/counter，附带 X-Api-Token。
 * GET/POST /stats?action=incr|get|getAll&key=...&n=...
 */
@RestController
public class StatsProxyController {

    private static final Logger log = LoggerFactory.getLogger(StatsProxyController.class);

    // ── 统计 key 定义（与旧版完全一致） ─────────────────────────────────
    private static final String KEY_PREFIX = "wealth-btn-";
    public static final String KEY_PLAYERS = KEY_PREFIX + "players";
    public static final String KEY_BANKRUPT = KEY_PREFIX + "bankrupt";
    public static final String KEY_BILLIONAIRE = KEY_PREFIX + "billionaire";

    private static final String GAMBLER_PREFIX = "gambler-ruin-";
    public static final String KEY_GAMBLER_PLAYERS = GAMBLER_PREFIX + "players";
    public static final String KEY_GAMBLER_BANKRUPT = GAMBLER_PREFIX + "bankrupt";
    public static final String KEY_GAMBLER_SUCCESS = GAMBLER_PREFIX + "success";
    public static final String KEY_GAMBLER_TOTAL_BETS = GAMBLER_PREFIX + "total-bets";
    public static final String KEY_GAMBLER_MAX_BETS = GAMBLER_PREFIX + "max-bets";

    public static final String KEY_QUANTUM_LOTTERY_TOTAL = "quantum-lottery-total";
    public static final String KEY_QUANTUM_LOTTERY_TODAY_PREFIX = "quantum-lottery-today-";
    public static final String KEY_QUANTUM_LOTTERY_USERS = "quantum-lottery-users";

    private static final String DOOMSDAY_PREFIX = "doomsday-btn-";
    public static final String KEY_DOOMSDAY_PRESS = DOOMSDAY_PREFIX + "press";
    public static final String KEY_DOOMSDAY_USERS = DOOMSDAY_PREFIX + "users";

    private static final String KELLY_PREFIX = "kelly-criterion-";
    public static final String KEY_KELLY_SIMS = KELLY_PREFIX + "sims";
    public static final String KEY_KELLY_USERS = KELLY_PREFIX + "users";
    public static final String KEY_KELLY_BATCH_SIMS = KELLY_PREFIX + "batch-sims";

    private static final String ATTENTION_PREFIX = "attention-challenge-";
    public static final String KEY_ATTENTION_PLAYERS = ATTENTION_PREFIX + "players";
    public static final String KEY_ATTENTION_COMPLETED = ATTENTION_PREFIX + "completed";
    public static final String KEY_ATTENTION_TOTAL_SCORE = ATTENTION_PREFIX + "total-score";
    public static final String KEY_ATTENTION_BEST_SCORE = ATTENTION_PREFIX + "best-score";
    public static final String KEY_ATTENTION_FASTEST_RT = ATTENTION_PREFIX + "fastest-rt";

    private static final Set<String> EXACT_KEYS = Set.of(
            KEY_PLAYERS, KEY_BANKRUPT, KEY_BILLIONAIRE,
            KEY_GAMBLER_PLAYERS, KEY_GAMBLER_BANKRUPT, KEY_GAMBLER_SUCCESS,
            KEY_GAMBLER_TOTAL_BETS, KEY_GAMBLER_MAX_BETS,
            KEY_QUANTUM_LOTTERY_TOTAL, KEY_QUANTUM_LOTTERY_USERS,
            KEY_DOOMSDAY_PRESS, KEY_DOOMSDAY_USERS,
            KEY_KELLY_SIMS, KEY_KELLY_USERS, KEY_KELLY_BATCH_SIMS,
            KEY_ATTENTION_PLAYERS, KEY_ATTENTION_COMPLETED, KEY_ATTENTION_TOTAL_SCORE,
            KEY_ATTENTION_BEST_SCORE, KEY_ATTENTION_FASTEST_RT
    );

    private final WebClient webClient;
    private final String apiToken;

    public StatsProxyController(@Qualifier("ninjaApiWebClient") WebClient webClient,
                               @Value("${ninja.api.token:}") String apiToken) {
        this.webClient = webClient;
        this.apiToken = apiToken;
        if (apiToken == null || apiToken.isEmpty()) {
            log.warn("NINJA_API_TOKEN (ninja.api.token) not set");
        }
    }

    @GetMapping(value = "/stats", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> getStats(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String key,
            @RequestParam(name = "n", required = false) String n) {
        return dispatch(action, key, n);
    }

    @PostMapping(value = "/stats", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> postStats(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String key,
            @RequestParam(name = "n", required = false) String n) {
        return dispatch(action, key, n);
    }

    private Mono<ResponseEntity<JsonNode>> dispatch(String action, String key, String n) {
        if (action == null) {
            return Mono.just(error(400, "Missing action parameter"));
        }
        return switch (action) {
            case "incr" -> handleIncr(key, n);
            case "get" -> handleGet(key);
            case "getAll" -> handleGetAll();
            default -> Mono.just(error(400, "Invalid action: " + action));
        };
    }

    private Mono<ResponseEntity<JsonNode>> handleIncr(String key, String nParam) {
        if (!isValidKey(key)) {
            return Mono.just(error(400, "Invalid key"));
        }
        String increment = (nParam != null && nParam.matches("\\d+")) ? nParam : "1";
        return webClient.post()
                .uri(uriBuilder -> uriBuilder.path("/counter/incr")
                        .queryParam("key", key).queryParam("n", increment).build())
                .header("X-Api-Token", apiToken)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(this::raw)
                .onErrorResume(err -> Mono.just(error(500, err.getMessage())));
    }

    private Mono<ResponseEntity<JsonNode>> handleGet(String key) {
        if (!isValidKey(key)) {
            return Mono.just(error(400, "Invalid key"));
        }
        return fetchCounter(key)
                .map(this::raw)
                .onErrorResume(err -> Mono.just(error(500, err.getMessage())));
    }

    private Mono<ResponseEntity<JsonNode>> handleGetAll() {
        return Mono.zip(
                        fetchCounter(KEY_PLAYERS).map(this::extractData),
                        fetchCounter(KEY_BANKRUPT).map(this::extractData),
                        fetchCounter(KEY_BILLIONAIRE).map(this::extractData))
                .map(tuple -> {
                    ObjectNode data = Json.obj();
                    data.put("players", tuple.getT1());
                    data.put("bankrupt", tuple.getT2());
                    data.put("billionaire", tuple.getT3());
                    ObjectNode body = Json.obj();
                    body.put("status", 200);
                    body.set("data", data);
                    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body((JsonNode) body);
                })
                .onErrorResume(err -> Mono.just(error(500, err.getMessage())));
    }

    private Mono<JsonNode> fetchCounter(String key) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/counter/get").queryParam("key", key).build())
                .header("X-Api-Token", apiToken)
                .retrieve()
                .bodyToMono(JsonNode.class);
    }

    private int extractData(JsonNode json) {
        if (json != null && json.has("data")) {
            return json.get("data").asInt(0);
        }
        return 0;
    }

    private boolean isValidKey(String key) {
        return key != null && (EXACT_KEYS.contains(key) || key.startsWith(KEY_QUANTUM_LOTTERY_TODAY_PREFIX));
    }

    private ResponseEntity<JsonNode> raw(JsonNode body) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private ResponseEntity<JsonNode> error(int status, String message) {
        ObjectNode body = Json.obj();
        body.put("status", status);
        body.put("message", message);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
