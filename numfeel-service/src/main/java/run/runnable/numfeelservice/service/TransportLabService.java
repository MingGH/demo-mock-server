package run.runnable.numfeelservice.service;

import org.springframework.stereotype.Service;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.TransportMetricResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.TransportSnapshotResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.TransportSummaryResponse;

/**
 * WebSocket/HTTP 传输实验计算服务。
 */
@Service
public class TransportLabService {

    /**
     * 根据查询参数计算传输方案快照。
     *
     * @param query 查询参数
     * @return 传输方案快照
     */
    public TransportSnapshotResponse snapshot(TransportLabQuery query) {
        var params = params(query);
        var eventsPerSecond = params.eventsPerMinute() / 60.0;
        var sessionMinutes = params.activeSeconds() / 60.0;
        var eventCount = Math.max(1, (int) Math.round(params.eventsPerMinute() * sessionMinutes));
        var pollCount = Math.max(1, (int) Math.ceil(params.activeSeconds() / params.pollInterval()));
        var effectivePollResponses = Math.min(eventCount, pollCount);
        var httpHeaders = 900;
        var websocketHandshake = 1100;
        var websocketFrameOverhead = 8;
        var httpBytesPerClient = (long) effectivePollResponses * (params.payloadSize() + httpHeaders);
        var wsBytesPerClient = websocketHandshake + (long) eventCount * (params.payloadSize() + websocketFrameOverhead);
        var httpServerMs = pollCount * params.serverWorkMs() * params.burst();
        var wsServerMs = (eventCount * params.serverWorkMs() * 0.42 + 4 + params.reconnects() * 5) * params.burst();
        var httpTotalBytes = httpBytesPerClient * params.clients();
        var wsTotalBytes = wsBytesPerClient * params.clients();
        var httpMemoryMb = round1(params.clients() * 4.0 / 1024.0);
        var wsMemoryMb = round1(params.clients() * params.connectionMemoryKb() / 1024.0);
        var httpLatency = (int) Math.round(params.pollInterval() * 500 + 80);
        var wsLatency = (int) Math.round(45 + params.reconnects() * 12 + Math.min(eventsPerSecond * 2, 80));
        var wsScore = scoreWebSocket(params, httpLatency, wsLatency, wsMemoryMb);
        var recommendation = wsScore >= 62 ? "websocket" : (wsScore <= 42 ? "http" : "mixed");

        var http = new TransportMetricResponse(
                httpTotalBytes,
                httpLatency,
                round1(httpServerMs * params.clients()),
                httpMemoryMb,
                (long) pollCount * params.clients());
        var websocket = new TransportMetricResponse(
                wsTotalBytes,
                wsLatency,
                round1(wsServerMs * params.clients()),
                wsMemoryMb,
                (long) eventCount * params.clients());
        var summary = new TransportSummaryResponse(
                round1(percentDelta(httpTotalBytes, wsTotalBytes)),
                round1(percentDelta(http.serverMs(), websocket.serverMs())),
                round1(percentDelta(httpLatency, wsLatency)),
                round1(percentDelta(wsMemoryMb, httpMemoryMb)));
        return new TransportSnapshotResponse(
                recommendation,
                reason(recommendation, params, eventCount, wsMemoryMb),
                eventCount,
                pollCount,
                http,
                websocket,
                summary);
    }

    private TransportParams params(TransportLabQuery query) {
        return new TransportParams(
                clamp(parseDouble(query == null ? null : query.eventsPerMinute(), 60), 1, 1000),
                (int) clamp(parseDouble(query == null ? null : query.payloadSize(), 500), 50, 20000),
                clamp(parseDouble(query == null ? null : query.activeSeconds(), 180), 30, 3600),
                (int) clamp(parseDouble(query == null ? null : query.clients(), 500), 1, 20000),
                clamp(parseDouble(query == null ? null : query.pollInterval(), 5), 0.5, 60),
                (int) clamp(parseDouble(query == null ? null : query.reconnects(), 0), 0, 20),
                2.0,
                48,
                1.2);
    }

    private double scoreWebSocket(TransportParams params, int httpLatency, int wsLatency, double wsMemoryMb) {
        var score = 35.0;
        score += Math.min(params.eventsPerMinute() / 4.0, 32);
        score += params.pollInterval() <= 2 ? 14 : (params.pollInterval() <= 5 ? 8 : 0);
        score += httpLatency > wsLatency * 4 ? 12 : 4;
        score += params.payloadSize() < 700 ? 5 : -4;
        score -= params.clients() > 2000 ? 9 : (params.clients() > 800 ? 5 : 0);
        score -= wsMemoryMb > 120 ? 10 : (wsMemoryMb > 40 ? 4 : 0);
        score -= params.reconnects() * 3.0;
        if (params.eventsPerMinute() <= 6) {
            score -= 28;
        }
        if (params.eventsPerMinute() <= 2) {
            score -= 18;
        }
        return clamp(score, 5, 95);
    }

    private String reason(String recommendation, TransportParams params, int eventCount, double wsMemoryMb) {
        return switch (recommendation) {
            case "websocket" -> "事件频率高，轮询会制造大量空请求或延迟；WebSocket 把一次连接摊到 " + eventCount + " 条消息上更划算。";
            case "http" -> "交互稀疏，HTTP 的一次请求一次响应足够清楚；WebSocket 会让 " + params.clients() + " 个客户端长期占用约 " + round1(wsMemoryMb) + " MB 连接内存。";
            default -> "两边都有理由：核心实时区用 WebSocket，列表、表单、历史记录继续走 HTTP，复杂度比较均衡。";
        };
    }

    private double percentDelta(double base, double value) {
        if (base == 0) {
            return 0;
        }
        return (base - value) / base * 100;
    }

    private double parseDouble(String value, double fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private record TransportParams(
            double eventsPerMinute,
            int payloadSize,
            double activeSeconds,
            int clients,
            double pollInterval,
            int reconnects,
            double serverWorkMs,
            int connectionMemoryKb,
            double burst
    ) {
    }
}
