package com.example.demo_mock_server.handler;

import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

public class MemoryLeaderboardHandler implements Handler<RoutingContext> {

    private static final int MAX_ENTRIES = 200;
    private static final int MAX_NAME_LENGTH = 24;
    private static final int MAX_HISTORY_ENTRIES = 20;

    private final List<JsonObject> records = new CopyOnWriteArrayList<>();

    @Override
    public void handle(RoutingContext ctx) {
        String method = ctx.request().method().name();
        if ("GET".equals(method)) {
            handleGet(ctx);
            return;
        }
        if ("POST".equals(method)) {
            handlePost(ctx);
            return;
        }
        sendError(ctx, 405, "Method not allowed");
    }

    private void handleGet(RoutingContext ctx) {
        int limit = parseInt(ctx.request().getParam("limit"), 20);
        limit = Math.max(1, Math.min(limit, 50));

        List<JsonObject> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());

        JsonArray top = new JsonArray();
        int size = Math.min(limit, sorted.size());
        for (int i = 0; i < size; i++) {
            JsonObject item = sorted.get(i).copy();
            item.put("rank", i + 1);
            top.add(item);
        }

        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("status", 200)
                .put("data", new JsonObject()
                    .put("total", records.size())
                    .put("leaders", top))
                .encode());
    }

    private void handlePost(RoutingContext ctx) {
        JsonObject body = ctx.body() != null ? ctx.body().asJsonObject() : null;
        if (body == null) {
            sendError(ctx, 400, "Invalid JSON body");
            return;
        }

        String name = sanitizeName(body.getString("name"));
        if (name.isEmpty()) {
            sendError(ctx, 400, "name is required");
            return;
        }

        Integer capacity = body.getInteger("capacity");
        if (capacity == null || capacity < 0 || capacity > 30) {
            sendError(ctx, 400, "capacity must be between 0 and 30");
            return;
        }

        JsonArray history = body.getJsonArray("history", new JsonArray());
        JsonArray safeHistory = new JsonArray();
        double accuracySum = 0;
        int accuracyCount = 0;
        int size = Math.min(history.size(), MAX_HISTORY_ENTRIES);
        for (int i = 0; i < size; i++) {
            Object item = history.getValue(i);
            if (!(item instanceof JsonObject)) {
                continue;
            }
            JsonObject historyItem = (JsonObject) item;
            Integer n = historyItem.getInteger("n");
            Double accuracy = historyItem.getDouble("accuracy");
            if (n == null || accuracy == null) {
                continue;
            }
            int safeN = Math.max(0, Math.min(n, 30));
            double safeAccuracy = Math.max(0, Math.min(accuracy, 100));
            safeHistory.add(new JsonObject()
                .put("n", safeN)
                .put("accuracy", safeAccuracy));
            accuracySum += safeAccuracy;
            accuracyCount++;
        }

        double avgAccuracy = accuracyCount == 0 ? 0 : accuracySum / accuracyCount;
        double cacheKB = body.getDouble("cacheKB", (capacity * 3.0) / 1024.0);
        cacheKB = Math.max(0, Math.min(cacheKB, 10));

        JsonObject record = new JsonObject()
            .put("id", UUID.randomUUID().toString())
            .put("name", name)
            .put("capacity", capacity)
            .put("cacheKB", round(cacheKB, 3))
            .put("avgAccuracy", round(avgAccuracy, 2))
            .put("history", safeHistory)
            .put("createdAt", Instant.now().toEpochMilli());

        records.add(record);
        trimRecords();

        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("status", 200)
                .put("data", record)
                .encode());
    }

    private void trimRecords() {
        if (records.size() <= MAX_ENTRIES) {
            return;
        }
        List<JsonObject> sorted = new ArrayList<>(records);
        sorted.sort(buildRankComparator());
        List<JsonObject> top = sorted.subList(0, MAX_ENTRIES);
        records.clear();
        records.addAll(top);
    }

    private Comparator<JsonObject> buildRankComparator() {
        return Comparator
            .comparing((JsonObject item) -> item.getInteger("capacity", 0), Comparator.reverseOrder())
            .thenComparing((JsonObject item) -> item.getDouble("avgAccuracy", 0.0), Comparator.reverseOrder())
            .thenComparingLong(item -> item.getLong("createdAt", Long.MAX_VALUE));
    }

    private String sanitizeName(String raw) {
        if (raw == null) {
            return "";
        }
        String trimmed = raw.trim().replaceAll("\\s+", " ");
        if (trimmed.isEmpty()) {
            return "";
        }
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

    private void sendError(RoutingContext ctx, int status, String message) {
        ctx.response()
            .setStatusCode(status)
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("status", status)
                .put("message", message)
                .encode());
    }
}
