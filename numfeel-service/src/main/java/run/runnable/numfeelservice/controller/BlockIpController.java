package run.runnable.numfeelservice.controller;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpCountryRankResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpDailyPointResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpEntryResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpMarkerResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpStatsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpSummaryResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.GeoLocationResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.RawErrorResponse;
import run.runnable.numfeelservice.service.GeoLocationService;
import run.runnable.numfeelservice.web.ApiResponse;
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

    private volatile BlockIpStatsResponse cachedResponse;
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
                .bodyToFlux(BlockIpUpstreamItem.class)
                .collectList()
                .publishOn(Schedulers.boundedElastic())
                .map(raw -> {
                    BlockIpStatsResponse processed = process(raw);
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
                            .body(ApiResponse.raw(new RawErrorResponse(err.getMessage())).getBody()));
                });
    }

    private BlockIpStatsResponse process(List<BlockIpUpstreamItem> raw) {
        String today = LocalDate.now().toString();
        long totalAttempts = 0;
        int todayCount = 0;

        Map<String, Integer> dailyCounts = new LinkedHashMap<>();
        Map<String, Integer> countryCounts = new HashMap<>();
        Map<String, MutableMarker> locationMap = new HashMap<>();
        List<BlockIpEntryResponse> list = new ArrayList<>();

        for (int i = 29; i >= 0; i--) {
            dailyCounts.put(LocalDate.now().minusDays(i).toString(), 0);
        }

        for (BlockIpUpstreamItem item : raw) {
            String ip = item.ipAddress();
            int attempts = item.attemptCount();
            totalAttempts += attempts;

            String createdAt = item.createdAt();
            if (createdAt.length() >= 10) {
                String dateKey = createdAt.substring(0, 10);
                if (dateKey.equals(today)) todayCount++;
                dailyCounts.computeIfPresent(dateKey, (k, v) -> v + 1);
            }

            GeoLocationResponse geo = geoService.lookup(ip);
            String country = geo.country() == null ? "Unknown" : geo.country();
            countryCounts.merge(country, 1, Integer::sum);

            Double lat = geo.lat();
            Double lng = geo.lng();
            if (lat != null && lng != null) {
                final int attemptsF = attempts;
                String key = String.format("%.0f,%.0f", lat, lng);
                locationMap.compute(key, (k, v) -> {
                    if (v == null) {
                        return new MutableMarker(lat, lng, country, 1, attemptsF);
                    }
                    v.count += 1;
                    v.attempts += attemptsF;
                    return v;
                });
            }

            list.add(new BlockIpEntryResponse(
                    ip,
                    attempts,
                    fmt(item.firstSeen()),
                    fmt(item.lastSeen()),
                    country,
                    geo.countryCode() == null ? "" : geo.countryCode()
            ));
        }

        list.sort((a, b) -> Integer.compare(b.count(), a.count()));

        List<BlockIpDailyPointResponse> daily = new ArrayList<>();
        dailyCounts.forEach((d, c) -> daily.add(new BlockIpDailyPointResponse(d, c)));

        List<BlockIpCountryRankResponse> countryRank = new ArrayList<>();
        countryCounts.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .limit(15)
                .forEach(e -> countryRank.add(new BlockIpCountryRankResponse(e.getKey(), e.getValue())));

        List<BlockIpMarkerResponse> markers = locationMap.values().stream()
                .map(v -> new BlockIpMarkerResponse(v.lat, v.lng, v.country, v.count, v.attempts))
                .toList();

        int total = raw.size();
        BlockIpSummaryResponse stats = new BlockIpSummaryResponse(
                total,
                totalAttempts,
                total > 0 ? Math.round(totalAttempts * 10.0 / total) / 10.0 : 0,
                todayCount,
                countryCounts.size()
        );

        return new BlockIpStatsResponse(
                stats,
                daily,
                countryRank,
                markers,
                list,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String fmt(String iso) {
        if (iso == null || iso.length() < 16) return "-";
        return iso.substring(5, 10) + " " + iso.substring(11, 16);
    }

    private ResponseEntity<JsonNode> ok(BlockIpStatsResponse data) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "public, max-age=300")
                .body(ApiResponse.raw(data).getBody());
    }

    private static final class MutableMarker {
        private final double lat;
        private final double lng;
        private final String country;
        private int count;
        private int attempts;

        private MutableMarker(double lat, double lng, String country, int count, int attempts) {
            this.lat = lat;
            this.lng = lng;
            this.country = country;
            this.count = count;
            this.attempts = attempts;
        }
    }

    /**
     * BlockIP 上游列表项。
     *
     * 只关心当前统计页实际会用到的字段，其他字段由 Jackson 忽略。
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record BlockIpUpstreamItem(
            String ipAddress,
            Integer attemptCount,
            String createdAt,
            String firstSeen,
            String lastSeen
    ) {
        private BlockIpUpstreamItem {
            ipAddress = ipAddress == null ? "" : ipAddress.trim();
            attemptCount = attemptCount == null ? 1 : attemptCount;
            createdAt = createdAt == null ? "" : createdAt;
            firstSeen = firstSeen == null ? "" : firstSeen;
            lastSeen = lastSeen == null ? "" : lastSeen;
        }
    }
}
