package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpCountryRankResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpDailyPointResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpEntryResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpMarkerResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpStatsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpSummaryResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.GeoLocationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * BlockIP 业务逻辑层。
 * 从上游 API 拉取数据，经 GeoLocation 增强，聚合统计后返回。
 */
@Service
public class BlockIpService {

    private static final Logger log = LoggerFactory.getLogger(BlockIpService.class);

    private static final String API_URL = "https://api.996.ninja/blockip/list";
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;
    private static final int DATE_WINDOW_DAYS = 30;
    private static final int TOP_COUNTRY_LIMIT = 15;

    private final WebClient webClient;
    private final GeoLocationService geoService;

    private volatile BlockIpStatsResponse cachedResponse;
    private volatile long cacheTimestamp;

    public BlockIpService(@Qualifier("genericWebClient") WebClient webClient,
                          GeoLocationService geoService) {
        this.webClient = webClient;
        this.geoService = geoService;
    }

    /**
     * 带缓存的统计查询。缓存 5 分钟，上游故障时返回过期缓存。
     */
    public Mono<BlockIpStatsResponse> stats() {
        long now = System.currentTimeMillis();
        if (cachedResponse != null && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return Mono.just(cachedResponse);
        }
        return fetchUpstream()
                .publishOn(Schedulers.boundedElastic())
                .map(raw -> {
                    BlockIpStatsResponse result = process(raw);
                    updateCache(result);
                    return result;
                })
                .onErrorResume(err -> {
                    if (cachedResponse != null) {
                        log.warn("BlockIP upstream error, serving stale cache: {}", err.getMessage());
                        return Mono.just(cachedResponse);
                    }
                    log.error("BlockIP upstream error, no cache available: {}", err.getMessage());
                    return Mono.error(err);
                });
    }

    private void updateCache(BlockIpStatsResponse response) {
        cachedResponse = response;
        cacheTimestamp = System.currentTimeMillis();
    }

    private Mono<List<BlockIpUpstreamItem>> fetchUpstream() {
        return webClient.get().uri(API_URL)
                .retrieve()
                .bodyToFlux(BlockIpUpstreamItem.class)
                .collectList();
    }

    /**
     * 核心处理：对上游原始数据进行聚合增强，构建完整的统计响应。
     */
    BlockIpStatsResponse process(List<BlockIpUpstreamItem> raw) {
        String today = LocalDate.now().toString();

        Map<String, Integer> dailyCounts = initDailyCounts();
        AggregationContext ctx = new AggregationContext();

        for (BlockIpUpstreamItem item : raw) {
            accumulate(item, today, dailyCounts, ctx);
        }

        List<BlockIpDailyPointResponse> daily = buildDailyPoints(dailyCounts);
        List<BlockIpCountryRankResponse> countryRank = buildCountryRank(ctx.countryCounts);
        List<BlockIpMarkerResponse> markers = buildMarkers(ctx.locationMap);
        List<BlockIpEntryResponse> list = sortEntries(ctx.entries);
        BlockIpSummaryResponse stats = buildSummary(raw.size(), ctx.totalAttempts, ctx.todayCount, ctx.countryCounts.size());

        return new BlockIpStatsResponse(
                stats,
                daily,
                countryRank,
                markers,
                list,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    // ---- 聚合步骤 ----

    private Map<String, Integer> initDailyCounts() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (int i = DATE_WINDOW_DAYS - 1; i >= 0; i--) {
            counts.put(LocalDate.now().minusDays(i).toString(), 0);
        }
        return counts;
    }

    private void accumulate(BlockIpUpstreamItem item, String today,
                            Map<String, Integer> dailyCounts, AggregationContext ctx) {
        int attempts = item.attemptCount();
        ctx.totalAttempts += attempts;

        String dateKey = extractDateKey(item.createdAt());
        if (dateKey.equals(today)) {
            ctx.todayCount++;
        }
        dailyCounts.computeIfPresent(dateKey, (k, v) -> v + 1);

        GeoLocationResponse geo = geoService.lookup(item.ipAddress());
        String country = geo.country() != null ? geo.country() : "Unknown";
        ctx.countryCounts.merge(country, 1, Integer::sum);

        if (geo.lat() != null && geo.lng() != null) {
            String locKey = String.format("%.0f,%.0f", geo.lat(), geo.lng());
            ctx.locationMap.compute(locKey, (k, v) -> {
                if (v == null) {
                    return new MutableMarker(geo.lat(), geo.lng(), country, 1, attempts);
                }
                v.count += 1;
                v.attempts += attempts;
                return v;
            });
        }

        ctx.entries.add(new BlockIpEntryResponse(
                item.ipAddress(),
                attempts,
                formatTime(item.firstSeen()),
                formatTime(item.lastSeen()),
                country,
                geo.countryCode() == null ? "" : geo.countryCode()
        ));
    }

    // ---- 构建响应部件 ----

    private List<BlockIpDailyPointResponse> buildDailyPoints(Map<String, Integer> dailyCounts) {
        return dailyCounts.entrySet().stream()
                .map(e -> new BlockIpDailyPointResponse(e.getKey(), e.getValue()))
                .collect(Collectors.toList());
    }

    private List<BlockIpCountryRankResponse> buildCountryRank(Map<String, Integer> countryCounts) {
        return countryCounts.entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, Integer>>comparingInt(Map.Entry::getValue).reversed())
                .limit(TOP_COUNTRY_LIMIT)
                .map(e -> new BlockIpCountryRankResponse(e.getKey(), e.getValue()))
                .collect(Collectors.toList());
    }

    private List<BlockIpMarkerResponse> buildMarkers(Map<String, MutableMarker> locationMap) {
        return locationMap.values().stream()
                .map(v -> new BlockIpMarkerResponse(v.lat, v.lng, v.country, v.count, v.attempts))
                .collect(Collectors.toList());
    }

    private List<BlockIpEntryResponse> sortEntries(List<BlockIpEntryResponse> entries) {
        entries.sort(Comparator.comparingInt(BlockIpEntryResponse::count).reversed());
        return entries;
    }

    private BlockIpSummaryResponse buildSummary(int total, long totalAttempts, int todayCount, int countryCount) {
        double avg = total > 0 ? Math.round(totalAttempts * 10.0 / total) / 10.0 : 0;
        return new BlockIpSummaryResponse(total, totalAttempts, avg, todayCount, countryCount);
    }

    // ---- 工具方法 ----

    private static String extractDateKey(String createdAt) {
        return createdAt != null && createdAt.length() >= 10 ? createdAt.substring(0, 10) : "";
    }

    static String formatTime(String iso) {
        if (iso == null || iso.length() < 16) {
            return "-";
        }
        return iso.substring(5, 10) + " " + iso.substring(11, 16);
    }

    // ---- 聚合上下文 ----

    private static final class AggregationContext {
        long totalAttempts;
        int todayCount;
        final Map<String, Integer> countryCounts = new HashMap<>();
        final Map<String, MutableMarker> locationMap = new HashMap<>();
        final List<BlockIpEntryResponse> entries = new ArrayList<>();
    }

    static final class MutableMarker {
        final double lat;
        final double lng;
        final String country;
        int count;
        int attempts;

        MutableMarker(double lat, double lng, String country, int count, int attempts) {
            this.lat = lat;
            this.lng = lng;
            this.country = country;
            this.count = count;
            this.attempts = attempts;
        }
    }

    // ---- 上游数据模型 ----

    @JsonIgnoreProperties(ignoreUnknown = true)
    record BlockIpUpstreamItem(
            String ipAddress,
            Integer attemptCount,
            String createdAt,
            String firstSeen,
            String lastSeen
    ) {
        BlockIpUpstreamItem {
            ipAddress = ipAddress == null ? "" : ipAddress.trim();
            attemptCount = attemptCount == null ? 1 : attemptCount;
            createdAt = createdAt == null ? "" : createdAt;
            firstSeen = firstSeen == null ? "" : firstSeen;
            lastSeen = lastSeen == null ? "" : lastSeen;
        }
    }
}
