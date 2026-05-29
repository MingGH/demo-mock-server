package ninja._6.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.ApiException;
import ninja._6.numfeelservice.web.ApiResponse;
import ninja._6.numfeelservice.web.Json;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 记忆挑战排行榜（内存存储，无 DB）。
 * GET  /memory-challenge/leaderboard — 查询榜单
 * POST /memory-challenge/leaderboard — 提交成绩
 */
@RestController
@RequestMapping("/memory-challenge/leaderboard")
public class MemoryLeaderboardController {

    private static final int MAX_ENTRIES = 200;
    private static final int MAX_NAME_LENGTH = 24;
    private static final int MAX_HISTORY_ENTRIES = 20;

    private final List<ObjectNode> records = new CopyOnWriteArrayList<>();

    @GetMapping
    public ResponseEntity<JsonNode> get(@RequestParam(required = false) String limit) {
        int lim = parseInt(limit, 20);
        lim = Math.max(1, Math.min(lim, 50));

        List<ObjectNode> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());

        ArrayNode top = Json.arr();
        int size = Math.min(lim, sorted.size());
        for (int i = 0; i < size; i++) {
            ObjectNode item = sorted.get(i).deepCopy();
            item.put("rank", i + 1);
            top.add(item);
        }

        ObjectNode data = Json.obj();
        data.put("total", records.size());
        data.set("leaders", top);
        return ApiResponse.ok(data);
    }

    @PostMapping
    public ResponseEntity<JsonNode> post(@RequestBody(required = false) JsonNode body) {
        if (body == null) {
            throw ApiException.badRequest("Invalid JSON body");
        }
        String name = sanitizeName(Json.getString(body, "name"));
        if (name.isEmpty()) {
            throw ApiException.badRequest("name is required");
        }
        Integer capacity = Json.getInteger(body, "capacity");
        if (capacity == null || capacity < 0 || capacity > 30) {
            throw ApiException.badRequest("capacity must be between 0 and 30");
        }

        ArrayNode history = Json.getArray(body, "history");
        ArrayNode safeHistory = Json.arr();
        double accuracySum = 0;
        int accuracyCount = 0;
        int size = history == null ? 0 : Math.min(history.size(), MAX_HISTORY_ENTRIES);
        for (int i = 0; i < size; i++) {
            JsonNode item = history.get(i);
            if (item == null || !item.isObject()) continue;
            Integer n = Json.getInteger(item, "n");
            Double accuracy = Json.getDouble(item, "accuracy");
            if (n == null || accuracy == null) continue;
            int safeN = Math.max(0, Math.min(n, 30));
            double safeAccuracy = Math.max(0, Math.min(accuracy, 100));
            ObjectNode h = Json.obj();
            h.put("n", safeN);
            h.put("accuracy", safeAccuracy);
            safeHistory.add(h);
            accuracySum += safeAccuracy;
            accuracyCount++;
        }

        double avgAccuracy = accuracyCount == 0 ? 0 : accuracySum / accuracyCount;
        double cacheKB = Json.getDouble(body, "cacheKB", (capacity * 3.0) / 1024.0);
        cacheKB = Math.max(0, Math.min(cacheKB, 10));

        ObjectNode record = Json.obj();
        record.put("id", UUID.randomUUID().toString());
        record.put("name", name);
        record.put("capacity", capacity);
        record.put("cacheKB", round(cacheKB, 3));
        record.put("avgAccuracy", round(avgAccuracy, 2));
        record.set("history", safeHistory);
        record.put("createdAt", Instant.now().toEpochMilli());

        records.add(record);
        trimRecords();

        return ApiResponse.ok(record);
    }

    private void trimRecords() {
        if (records.size() <= MAX_ENTRIES) {
            return;
        }
        List<ObjectNode> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());
        List<ObjectNode> top = new ArrayList<>(sorted.subList(0, MAX_ENTRIES));
        records.clear();
        records.addAll(top);
    }

    private Comparator<ObjectNode> buildRankComparator() {
        return Comparator
                .comparing((ObjectNode item) -> item.path("capacity").asInt(0), Comparator.reverseOrder())
                .thenComparing((ObjectNode item) -> item.path("avgAccuracy").asDouble(0.0), Comparator.reverseOrder())
                .thenComparingLong(item -> item.path("createdAt").asLong(Long.MAX_VALUE));
    }

    private String sanitizeName(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim().replaceAll("\\s+", " ");
        if (trimmed.isEmpty()) return "";
        if (trimmed.length() > MAX_NAME_LENGTH) {
            return trimmed.substring(0, MAX_NAME_LENGTH);
        }
        return trimmed;
    }

    private int parseInt(String value, int fallback) {
        if (value == null || !value.matches("\\d+")) {
            return fallback;
        }
        return Integer.parseInt(value);
    }

    private double round(double value, int precision) {
        double factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }
}
