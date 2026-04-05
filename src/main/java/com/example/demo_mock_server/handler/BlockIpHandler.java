package com.example.demo_mock_server.handler;

import com.example.demo_mock_server.service.GeoLocationService;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * BlockIP 代理处理器（带 5 分钟缓存）
 * GET /blockip/stats
 */
public class BlockIpHandler implements Handler<RoutingContext> {

    private static final Logger log = LoggerFactory.getLogger(BlockIpHandler.class);

    private static final String API_URL     = "https://api.996.ninja/blockip/list";
    private static final long   CACHE_TTL   = 5 * 60 * 1000L;

    private final WebClient webClient;
    private final GeoLocationService geoService;

    private volatile JsonObject cachedResponse;
    private volatile long       cacheTimestamp;
    private volatile boolean    loading;

    public BlockIpHandler(Vertx vertx, GeoLocationService geoService) {
        this.webClient  = WebClient.create(vertx, new WebClientOptions()
            .setConnectTimeout(30_000).setIdleTimeout(60));
        this.geoService = geoService;
    }

    @Override
    public void handle(RoutingContext ctx) {
        long now = System.currentTimeMillis();
        if (cachedResponse != null && (now - cacheTimestamp) < CACHE_TTL) {
            sendOk(ctx, cachedResponse);
            return;
        }
        if (loading && cachedResponse != null) {
            sendOk(ctx, cachedResponse);
            return;
        }
        loading = true;
        webClient.getAbs(API_URL).timeout(30_000).send()
            .onSuccess(resp -> {
                try {
                    cachedResponse = process(resp.bodyAsJsonArray());
                    cacheTimestamp = System.currentTimeMillis();
                } catch (Exception e) {
                    log.error("Failed to process blockip data", e);
                } finally {
                    loading = false;
                }
                sendOk(ctx, cachedResponse);
            })
            .onFailure(err -> {
                loading = false;
                if (cachedResponse != null) {
                    sendOk(ctx, cachedResponse);
                } else {
                    log.error("BlockIP upstream error: {}", err.getMessage());
                    ctx.response().setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject().put("error", err.getMessage()).encode());
                }
            });
    }

    private JsonObject process(JsonArray raw) {
        String today = LocalDate.now().toString();
        long totalAttempts = 0;
        int todayCount = 0;

        Map<String, Integer> dailyCounts   = new LinkedHashMap<>();
        Map<String, Integer> countryCounts = new HashMap<>();
        Map<String, JsonObject> locationMap = new HashMap<>();
        List<JsonObject> list = new ArrayList<>();

        for (int i = 29; i >= 0; i--) {
            dailyCounts.put(LocalDate.now().minusDays(i).toString(), 0);
        }

        for (int i = 0; i < raw.size(); i++) {
            JsonObject item = raw.getJsonObject(i);
            String ip = item.getString("ipAddress");
            int attempts = item.getInteger("attemptCount", 1);
            totalAttempts += attempts;

            String createdAt = item.getString("createdAt", "");
            if (createdAt.length() >= 10) {
                String dateKey = createdAt.substring(0, 10);
                if (dateKey.equals(today)) todayCount++;
                dailyCounts.computeIfPresent(dateKey, (k, v) -> v + 1);
            }

            JsonObject geo = geoService.lookup(ip);
            String country = geo.getString("country", "Unknown");
            countryCounts.merge(country, 1, Integer::sum);

            Double lat = geo.getDouble("lat");
            Double lng = geo.getDouble("lng");
            if (lat != null && lng != null) {
                String key = String.format("%.0f,%.0f", lat, lng);
                locationMap.compute(key, (k, v) -> {
                    if (v == null) return new JsonObject()
                        .put("lat", lat).put("lng", lng)
                        .put("country", country).put("count", 1).put("attempts", attempts);
                    return v.put("count", v.getInteger("count") + 1)
                            .put("attempts", v.getInteger("attempts") + attempts);
                });
            }

            list.add(new JsonObject()
                .put("ip", ip)
                .put("count", attempts)
                .put("first", fmt(item.getString("firstSeen")))
                .put("last",  fmt(item.getString("lastSeen")))
                .put("country", country)
                .put("countryCode", geo.getString("countryCode", "")));
        }

        list.sort((a, b) -> b.getInteger("count") - a.getInteger("count"));

        JsonArray daily = new JsonArray();
        dailyCounts.forEach((d, c) -> daily.add(new JsonObject().put("date", d).put("count", c)));

        JsonArray countryRank = new JsonArray();
        countryCounts.entrySet().stream()
            .sorted((a, b) -> b.getValue() - a.getValue())
            .limit(15)
            .forEach(e -> countryRank.add(new JsonObject()
                .put("country", e.getKey()).put("count", e.getValue())));

        JsonArray markers = new JsonArray();
        locationMap.values().forEach(markers::add);

        int total = raw.size();
        return new JsonObject()
            .put("stats", new JsonObject()
                .put("totalIPs", total)
                .put("totalAttempts", totalAttempts)
                .put("avgAttempts", total > 0 ? Math.round(totalAttempts * 10.0 / total) / 10.0 : 0)
                .put("todayCount", todayCount)
                .put("countryCount", countryCounts.size()))
            .put("daily", daily)
            .put("countryRank", countryRank)
            .put("markers", markers)
            .put("list", new JsonArray(list))
            .put("cacheTime", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
    }

    private String fmt(String iso) {
        if (iso == null || iso.length() < 16) return "-";
        return iso.substring(5, 10) + " " + iso.substring(11, 16);
    }

    private void sendOk(RoutingContext ctx, JsonObject data) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .putHeader("Cache-Control", "public, max-age=300")
            .end(data.encode());
    }
}
