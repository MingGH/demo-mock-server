package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.MemoryHistoryItemResponse;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryHistoryItem;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryLeaderboardGetQuery;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryLeaderboardPostRequest;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.MemoryLeaderboardEntryResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.MemoryLeaderboardListResponse;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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

    private final List<MemoryLeaderboardEntryResponse> records = new CopyOnWriteArrayList<>();

    @GetMapping
    public ResponseEntity<JsonNode> get(@ModelAttribute MemoryLeaderboardGetQuery query) {
        int lim = parseInt(query == null ? null : query.limit(), 20);
        lim = Math.max(1, Math.min(lim, 50));

        List<MemoryLeaderboardEntryResponse> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());

        List<MemoryLeaderboardEntryResponse> top = new ArrayList<>();
        int size = Math.min(lim, sorted.size());
        for (int i = 0; i < size; i++) {
            MemoryLeaderboardEntryResponse item = sorted.get(i);
            top.add(withRank(item, i + 1));
        }

        return ApiResponse.ok(new MemoryLeaderboardListResponse(records.size(), top));
    }

    @PostMapping
    public ResponseEntity<JsonNode> post(@RequestBody(required = false) MemoryLeaderboardPostRequest request) {
        if (request == null) {
            throw ApiException.badRequest("Invalid JSON body");
        }
        String name = sanitizeName(request.name());
        if (name.isEmpty()) {
            throw ApiException.badRequest("name is required");
        }
        Integer capacity = request.capacity();
        if (capacity == null || capacity < 0 || capacity > 30) {
            throw ApiException.badRequest("capacity must be between 0 and 30");
        }

        List<MemoryHistoryItemResponse> safeHistory = new ArrayList<>();
        double accuracySum = 0;
        int accuracyCount = 0;
        List<MemoryHistoryItem> history = request.history();
        int size = history == null ? 0 : Math.min(history.size(), MAX_HISTORY_ENTRIES);
        for (int i = 0; i < size; i++) {
            MemoryHistoryItem item = history.get(i);
            if (item == null) continue;
            Integer n = item.n();
            Double accuracy = item.accuracy();
            if (n == null || accuracy == null) continue;
            int safeN = Math.max(0, Math.min(n, 30));
            double safeAccuracy = Math.max(0, Math.min(accuracy, 100));
            safeHistory.add(new MemoryHistoryItemResponse(safeN, safeAccuracy));
            accuracySum += safeAccuracy;
            accuracyCount++;
        }

        double avgAccuracy = accuracyCount == 0 ? 0 : accuracySum / accuracyCount;
        double cacheKB = request.cacheKB() == null ? (capacity * 3.0) / 1024.0 : request.cacheKB();
        cacheKB = Math.max(0, Math.min(cacheKB, 10));

        MemoryLeaderboardEntryResponse record = new MemoryLeaderboardEntryResponse(
                UUID.randomUUID().toString(),
                name,
                capacity,
                round(cacheKB, 3),
                round(avgAccuracy, 2),
                safeHistory,
                Instant.now().toEpochMilli(),
                null
        );

        records.add(record);
        trimRecords();

        return ApiResponse.ok(record);
    }

    private void trimRecords() {
        if (records.size() <= MAX_ENTRIES) {
            return;
        }
        List<MemoryLeaderboardEntryResponse> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());
        List<MemoryLeaderboardEntryResponse> top = new ArrayList<>(sorted.subList(0, MAX_ENTRIES));
        records.clear();
        records.addAll(top);
    }

    private Comparator<MemoryLeaderboardEntryResponse> buildRankComparator() {
        return Comparator
                .comparing(MemoryLeaderboardEntryResponse::capacity, Comparator.reverseOrder())
                .thenComparing(MemoryLeaderboardEntryResponse::avgAccuracy, Comparator.reverseOrder())
                .thenComparingLong(MemoryLeaderboardEntryResponse::createdAt);
    }

    private MemoryLeaderboardEntryResponse withRank(MemoryLeaderboardEntryResponse record, int rank) {
        return new MemoryLeaderboardEntryResponse(
                record.id(),
                record.name(),
                record.capacity(),
                record.cacheKB(),
                record.avgAccuracy(),
                record.history(),
                record.createdAt(),
                rank
        );
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
