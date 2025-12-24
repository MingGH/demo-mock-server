package com.example.demo_mock_server.handler;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CountryResponse;
import com.maxmind.geoip2.record.Country;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;

import java.io.InputStream;
import java.net.InetAddress;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * BlockIP 代理处理器，带缓存、预处理统计和IP地理位置
 */
public class BlockIpHandler implements Handler<RoutingContext> {

    private static final String API_URL = "https://api.996.ninja/blockip/list";
    private static final long CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存

    private final WebClient webClient;
    private DatabaseReader geoReader;
    
    // 缓存
    private volatile JsonObject cachedResponse = null;
    private volatile long cacheTimestamp = 0;
    private volatile boolean isLoading = false;

    public BlockIpHandler(Vertx vertx) {
        WebClientOptions options = new WebClientOptions()
            .setConnectTimeout(30000)
            .setIdleTimeout(60);
        this.webClient = WebClient.create(vertx, options);
        
        // 初始化 GeoIP 数据库
        initGeoDatabase();
    }

    private void initGeoDatabase() {
        try {
            InputStream dbStream = getClass().getResourceAsStream("/GeoLite2-Country.mmdb");
            if (dbStream != null) {
                geoReader = new DatabaseReader.Builder(dbStream).build();
                System.out.println("GeoIP Country database loaded successfully");
            } else {
                System.out.println("GeoIP database not found, geolocation will be disabled");
            }
        } catch (Exception e) {
            System.err.println("Failed to load GeoIP database: " + e.getMessage());
        }
    }

    @Override
    public void handle(RoutingContext ctx) {
        long now = System.currentTimeMillis();
        
        // 检查缓存是否有效
        if (cachedResponse != null && (now - cacheTimestamp) < CACHE_TTL_MS) {
            sendResponse(ctx, cachedResponse);
            return;
        }

        // 避免并发请求
        if (isLoading && cachedResponse != null) {
            sendResponse(ctx, cachedResponse);
            return;
        }

        isLoading = true;
        
        // 请求上游API
        webClient.getAbs(API_URL)
            .timeout(30000)
            .send()
            .onSuccess(response -> {
                try {
                    JsonArray rawData = response.bodyAsJsonArray();
                    JsonObject processed = processData(rawData);
                    
                    cachedResponse = processed;
                    cacheTimestamp = System.currentTimeMillis();
                    isLoading = false;
                    
                    sendResponse(ctx, processed);
                } catch (Exception e) {
                    isLoading = false;
                    handleError(ctx, e);
                }
            })
            .onFailure(err -> {
                isLoading = false;
                if (cachedResponse != null) {
                    sendResponse(ctx, cachedResponse);
                } else {
                    handleError(ctx, err);
                }
            });
    }

    /**
     * 预处理数据，生成统计信息和地理位置
     */
    private JsonObject processData(JsonArray rawData) {
        int totalIPs = rawData.size();
        long totalAttempts = 0;
        int todayCount = 0;
        
        String today = LocalDate.now().toString();
        
        // 最近30天统计
        Map<String, Integer> dailyCounts = new LinkedHashMap<>();
        for (int i = 29; i >= 0; i--) {
            String date = LocalDate.now().minusDays(i).toString();
            dailyCounts.put(date, 0);
        }
        
        // 国家统计
        Map<String, Integer> countryCounts = new HashMap<>();
        
        // IP列表
        List<JsonObject> sortedList = new ArrayList<>();
        
        for (int i = 0; i < rawData.size(); i++) {
            JsonObject item = rawData.getJsonObject(i);
            
            String ipAddress = item.getString("ipAddress");
            int attemptCount = item.getInteger("attemptCount", 1);
            totalAttempts += attemptCount;
            
            String createdAt = item.getString("createdAt", "");
            if (createdAt.length() >= 10) {
                String dateKey = createdAt.substring(0, 10);
                if (dateKey.equals(today)) {
                    todayCount++;
                }
                if (dailyCounts.containsKey(dateKey)) {
                    dailyCounts.put(dateKey, dailyCounts.get(dateKey) + 1);
                }
            }
            
            // 获取地理位置
            JsonObject geoInfo = getGeoLocation(ipAddress);
            String country = geoInfo.getString("country", "Unknown");
            
            // 国家统计
            countryCounts.put(country, countryCounts.getOrDefault(country, 0) + 1);
            
            // 简化数据结构
            JsonObject simplified = new JsonObject()
                .put("ip", ipAddress)
                .put("count", attemptCount)
                .put("first", formatDateTime(item.getString("firstSeen")))
                .put("last", formatDateTime(item.getString("lastSeen")))
                .put("country", country)
                .put("countryCode", geoInfo.getString("countryCode", ""));
            
            sortedList.add(simplified);
        }
        
        // 按尝试次数降序排序
        sortedList.sort((a, b) -> b.getInteger("count") - a.getInteger("count"));
        
        // 构建每日统计数组
        JsonArray dailyStats = new JsonArray();
        for (Map.Entry<String, Integer> entry : dailyCounts.entrySet()) {
            dailyStats.add(new JsonObject()
                .put("date", entry.getKey())
                .put("count", entry.getValue()));
        }
        
        // 构建国家排行（前15）
        JsonArray countryRank = new JsonArray();
        countryCounts.entrySet().stream()
            .sorted((a, b) -> b.getValue() - a.getValue())
            .limit(15)
            .forEach(e -> countryRank.add(new JsonObject()
                .put("country", e.getKey())
                .put("count", e.getValue())));
        
        // 构建响应
        return new JsonObject()
            .put("stats", new JsonObject()
                .put("totalIPs", totalIPs)
                .put("totalAttempts", totalAttempts)
                .put("avgAttempts", totalIPs > 0 ? Math.round(totalAttempts * 10.0 / totalIPs) / 10.0 : 0)
                .put("todayCount", todayCount)
                .put("countryCount", countryCounts.size()))
            .put("daily", dailyStats)
            .put("countryRank", countryRank)
            .put("list", new JsonArray(sortedList))
            .put("cacheTime", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
    }

    /**
     * 获取IP地理位置（仅国家级别）
     */
    private JsonObject getGeoLocation(String ipAddress) {
        JsonObject result = new JsonObject();
        
        if (geoReader == null) {
            return result.put("country", "Unknown");
        }
        
        try {
            InetAddress ip = InetAddress.getByName(ipAddress);
            CountryResponse response = geoReader.country(ip);
            
            Country country = response.getCountry();
            
            if (country != null && country.getName() != null) {
                result.put("country", country.getName());
                result.put("countryCode", country.getIsoCode());
            } else {
                result.put("country", "Unknown");
            }
            
        } catch (Exception e) {
            // IP not found or invalid
            result.put("country", "Unknown");
        }
        
        return result;
    }

    private String formatDateTime(String isoString) {
        if (isoString == null || isoString.length() < 16) {
            return "-";
        }
        return isoString.substring(5, 10) + " " + isoString.substring(11, 16);
    }

    private void sendResponse(RoutingContext ctx, JsonObject data) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .putHeader("Cache-Control", "public, max-age=300")
            .end(data.encode());
    }

    private void handleError(RoutingContext ctx, Throwable err) {
        ctx.response()
            .setStatusCode(500)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("error", "Failed to fetch data")
                .put("message", err.getMessage())
                .encode());
    }
}
