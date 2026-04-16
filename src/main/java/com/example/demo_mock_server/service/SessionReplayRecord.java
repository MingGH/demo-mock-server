package com.example.demo_mock_server.service;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/**
 * 会话回放 demo 的一次提交记录
 */
public record SessionReplayRecord(
    String sessionId,
    int questionCount,
    long durationMs,
    int eventCount,
    int typedChars,
    int focusSwitches,
    double maxScrollPct,
    JsonObject answers,
    JsonArray events
) {
}
