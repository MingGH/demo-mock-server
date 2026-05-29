package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.service.GeoLocationService;
import ninja._6.numfeelservice.web.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * BlockIP 代理处理器（带 5 分钟缓存）。
 * GET /blockip/stats
 */
@RestController
@RequestMapping("/blockip")
public class BlockIpController {

    private static final Logger log = LoggerFactory.getLogger(BlockIpController.class);

    private static final String API_URL = "https://api.996.ninja/blockip/list";
    private static final long CACHE_TTL = 5 * 60 * 1000L;

    private final WebClient webClient;
    private final GeoLocationService geoService;

    private volatile ObjectNode cachedResponse;
    private volatile long cacheTimestamp;

    public BlockIpController(@Qualifier("genericWebClient") WebClient webClient,
                             GeoLocationService geoService) {
        this.webClient = webClient;
        this.geoService = geoService;
    }

    @GetMapping(value = "/stats", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> stats() {
        long now = System.currentTimeMillis();
        if (cachedResponse != null && (now - cacheTimestamp) < CACHE_TTL) {
            return Mono.just(ok(cachedResponse));
        }
        return webClient.get().uri(API_URL)
                .retrieve()
                .bodyToMono(ArrayNode.class)
                .publishOn(Schedulers.boundedElastic())
                .map(raw -> {
                    ObjectNode processed = process(raw);
                    cachedResponse = processed;
                    cacheTimestamp = System.currentTimeMillis();
                    return ok(processed);
                })
                .onErrorResume(err -> {
                    if (cachedResponse != null) {
                        return Mono.just(ok(cachedResponse));
                    }
                    log.error("BlockIP upstream error: {}", err.getMessage());
                    return Mono.just(ResponseEntity.status(500)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(Json.obj().put("error", err.getMessage())));
                });
    }

    private ObjectNode process(ArrayNode raw) {
        String today = LocalDate.now().toString();
        long totalAttempts = 0;
        int todayCount = 0;

        Map<String, Integer> dailyCounts = new LinkedHashMap<>();
        Map<String, Integer> countryCounts = new HashMap<>();
        Map<String, ObjectNode> locationMap = new HashMap<>();
        List<ObjectNode> list = new ArrayList<>();

        for (int i = 29; i >= 0; i--) {
            dailyCounts.put(LocalDate.now().minusDays(i).toString(), 0);
        }

        for (int i = 0; i < raw.size(); i++) {
            JsonNode item = raw.get(i);
            String ip = Json.getString(item, "ipAddress");
            int attempts = Json.getInteger(item, "attemptCount", 1);
            totalAttempts += attempts;

            String createdAt = Json.getString(item, "createdAt", "");
            if (createdAt.length() >= 10) {
                String dateKey = createdAt.substring(0, 10);
                if (dateKey.equals(today)) todayCount++;
                dailyCounts.computeIfPresent(dateKey, (k, v) -> v + 1);
            }

            ObjectNode geo = geoService.lookup(ip);
            String country = Json.getString(geo, "country", "Unknown");
            countryCounts.merge(country, 1, Integer::sum);

            Double lat = Json.getDouble(geo, "lat");
            Double lng = Json.getDouble(geo, "lng");
            if (lat != null && lng != null) {
                final int attemptsF = attempts;
                String key = String.format("%.0f,%.0f", lat, lng);
                locationMap.compute(key, (k, v) -> {
                    if (v == null) {
                        ObjectNode o = Json.obj();
                        o.put("lat", lat);
                        o.put("lng", lng);
                        o.put("country", country);
                        o.put("count", 1);
                        o.put("attempts", attemptsF);
                        return o;
                    }
                    v.put("count", v.get("count").asInt() + 1);
                    v.put("attempts", v.get("attempts").asInt() + attemptsF);
                    return v;
                });
            }

            ObjectNode entry = Json.obj();
            entry.put("ip", ip);
            entry.put("count", attempts);
            entry.put("first", fmt(Json.getString(item, "firstSeen")));
            entry.put("last", fmt(Json.getString(item, "lastSeen")));
            entry.put("country", country);
            entry.put("countryCode", Json.getString(geo, "countryCode", ""));
            list.add(entry);
        }

        list.sort((a, b) -> b.get("count").asInt() - a.get("count").asInt());

        ArrayNode daily = Json.arr();
        dailyCounts.forEach((d, c) -> {
            ObjectNode o = Json.obj();
            o.put("date", d);
            o.put("count", c);
            daily.add(o);
        });

        ArrayNode countryRank = Json.arr();
        countryCounts.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .limit(15)
                .forEach(e -> {
                    ObjectNode o = Json.obj();
                    o.put("country", e.getKey());
                    o.put("count", e.getValue());
                    countryRank.add(o);
                });

        ArrayNode markers = Json.arr();
        locationMap.values().forEach(markers::add);

        ArrayNode listArr = Json.arr();
        list.forEach(listArr::add);

        int total = raw.size();
        ObjectNode stats = Json.obj();
        stats.put("totalIPs", total);
        stats.put("totalAttempts", totalAttempts);
        stats.put("avgAttempts", total > 0 ? Math.round(totalAttempts * 10.0 / total) / 10.0 : 0);
        stats.put("todayCount", todayCount);
        stats.put("countryCount", countryCounts.size());

        ObjectNode result = Json.obj();
        result.set("stats", stats);
        result.set("daily", daily);
        result.set("countryRank", countryRank);
        result.set("markers", markers);
        result.set("list", listArr);
        result.put("cacheTime", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        return result;
    }

    private String fmt(String iso) {
        if (iso == null || iso.length() < 16) return "-";
        return iso.substring(5, 10) + " " + iso.substring(11, 16);
    }

    private ResponseEntity<JsonNode> ok(ObjectNode data) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "public, max-age=300")
                .body(data);
    }
}
