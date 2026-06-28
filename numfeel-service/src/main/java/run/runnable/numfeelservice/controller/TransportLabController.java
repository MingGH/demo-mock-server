package run.runnable.numfeelservice.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.TransportLabQuery;
import run.runnable.numfeelservice.service.TransportLabService;
import run.runnable.numfeelservice.web.ApiResponse;

import java.time.Instant;
import java.util.List;
import java.util.Random;

/**
 * WebSocket/HTTP 传输实验接口。
 */
@RestController
@RequestMapping("/transport-lab")
public class TransportLabController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Random RNG = new Random();

    private final TransportLabService transportLabService;

    public TransportLabController(TransportLabService transportLabService) {
        this.transportLabService = transportLabService;
    }

    @GetMapping(value = "/snapshot", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> snapshot(@ModelAttribute TransportLabQuery query) {
        return Mono.fromSupplier(() -> ApiResponse.ok(transportLabService.snapshot(query)));
    }

    @GetMapping(value = "/benchmark", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> benchmark(@RequestParam(defaultValue = "1024") int size) {
        return Mono.fromSupplier(() -> {
            var clampedSize = Math.max(64, Math.min(size, 65536));
            var node = MAPPER.createObjectNode();
            node.put("serverTime", Instant.now().toEpochMilli());
            node.put("size", clampedSize);
            var payload = new StringBuilder();
            var chunk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
            while (payload.length() < clampedSize - 128) payload.append(chunk);
            if (payload.length() > clampedSize - 128) payload.setLength(clampedSize - 128);
            node.put("payload", payload.toString());
            return ApiResponse.ok(node);
        });
    }

    // ══════════════════════════════════════════
    //  场景 HTTP 接口 —— 一次性返回完整数据
    // ══════════════════════════════════════════

    @GetMapping(value = "/scenario/trading", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> scenarioTrading() {
        return Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("scenario", "trading");
            node.put("serverTime", Instant.now().toEpochMilli());

            var symbols = new String[]{"BTC/USD", "ETH/USD", "AAPL", "GOOGL", "TSLA", "NVDA"};
            var arr = MAPPER.createArrayNode();
            for (var sym : symbols) {
                var s = MAPPER.createObjectNode();
                s.put("symbol", sym);
                s.put("price", Math.round((100 + RNG.nextDouble() * 900) * 100) / 100.0);
                s.put("change", Math.round((RNG.nextDouble() - 0.48) * 500) / 100.0);
                s.put("volume", 100 + RNG.nextInt(5000));
                arr.add(s);
            }
            node.set("symbols", arr);

            var trades = MAPPER.createArrayNode();
            for (int i = 0; i < 8; i++) {
                var t = MAPPER.createObjectNode();
                t.put("time", System.currentTimeMillis() - (8 - i) * 3000L);
                t.put("symbol", symbols[RNG.nextInt(symbols.length)]);
                t.put("price", Math.round((100 + RNG.nextDouble() * 900) * 100) / 100.0);
                t.put("amount", Math.round((0.01 + RNG.nextDouble() * 5) * 100) / 100.0);
                trades.add(t);
            }
            node.set("recentTrades", trades);
            return ApiResponse.ok(node);
        });
    }

    @GetMapping(value = "/scenario/profile", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> scenarioProfile() {
        return Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("scenario", "profile");
            node.put("serverTime", Instant.now().toEpochMilli());

            var fields = MAPPER.createArrayNode();
            addField(fields, "avatar", "李思远", "https://i.pravatar.cc/120?u=profile-demo", "头像");
            addField(fields, "name", "李思远", "", "姓名");
            addField(fields, "email", "lisiyuan@example.com", "", "邮箱");
            addField(fields, "phone", "+86 138-0000-1234", "", "手机");
            addField(fields, "company", "数感科技有限公司", "", "公司");
            addField(fields, "position", "高级前端工程师", "", "职位");
            addField(fields, "bio", "热爱技术、摄影和徒步。相信好的产品是克制出来的。", "", "简介");
            addField(fields, "joinDate", "2022-03-15", "", "入职日期");
            node.set("fields", fields);
            return ApiResponse.ok(node);
        });
    }

    private void addField(ArrayNode fields, String key, String value, String imageUrl, String label) {
        var f = MAPPER.createObjectNode();
        f.put("key", key);
        f.put("value", value);
        f.put("label", label);
        if (!imageUrl.isEmpty()) f.put("imageUrl", imageUrl);
        fields.add(f);
    }

    @GetMapping(value = "/scenario/dashboard", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> scenarioDashboard() {
        return Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("scenario", "dashboard");
            node.put("serverTime", Instant.now().toEpochMilli());

            var metrics = MAPPER.createArrayNode();
            addMetric(metrics, "cpu", "CPU 使用率", round1(20 + RNG.nextDouble() * 60), "%");
            addMetric(metrics, "memory", "内存使用率", round1(30 + RNG.nextDouble() * 50), "%");
            addMetric(metrics, "qps", "每秒请求数", 100 + RNG.nextInt(2000), "req/s");
            addMetric(metrics, "conns", "活跃连接数", 10 + RNG.nextInt(500), "");
            addMetric(metrics, "p99", "P99 延迟", round1(10 + RNG.nextDouble() * 200), "ms");
            addMetric(metrics, "uptime", "运行时间", 1 + RNG.nextInt(720), "h");
            node.set("metrics", metrics);
            return ApiResponse.ok(node);
        });
    }

    private void addMetric(ArrayNode arr, String key, String label, Object value, String unit) {
        var m = MAPPER.createObjectNode();
        m.put("key", key);
        m.put("label", label);
        if (value instanceof Integer) m.put("value", (int) value);
        else m.put("value", (double) value);
        if (!unit.isEmpty()) m.put("unit", unit);
        arr.add(m);
    }

    @GetMapping(value = "/scenario/gaming", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> scenarioGaming() {
        return Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("scenario", "gaming");
            node.put("serverTime", Instant.now().toEpochMilli());

            var players = MAPPER.createArrayNode();
            var names = new String[]{"战士·铁壁", "法师·星火", "刺客·影刃", "牧师·圣光", "射手·猎风", "骑士·黎明"};
            var classes = new String[]{"warrior", "mage", "assassin", "priest", "archer", "knight"};
            for (int i = 0; i < 6; i++) {
                var p = MAPPER.createObjectNode();
                p.put("id", "P" + (i + 1));
                p.put("name", names[i]);
                p.put("cls", classes[i]);
                p.put("maxHp", 1000 + RNG.nextInt(4000));
                p.put("hp", 500 + RNG.nextInt(1000));
                p.put("x", 10 + RNG.nextInt(80));
                p.put("y", 10 + RNG.nextInt(80));
                players.add(p);
            }
            node.set("players", players);
            return ApiResponse.ok(node);
        });
    }

    @GetMapping(value = "/scenario/idle", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> scenarioIdle() {
        return Mono.fromSupplier(() -> {
            var node = MAPPER.createObjectNode();
            node.put("scenario", "idle");
            node.put("serverTime", Instant.now().toEpochMilli());
            node.put("message", "WebSocket 空闲长连接：仅心跳保活，不传输业务数据。HTTP 对比：每次轮询请求约 900 字节头部开销。");
            // HTTP keepalive 参考：每个请求头约 900B，WebSocket 心跳帧仅 2B
            node.put("httpHeadersPerPoll", 900);
            node.put("wsFrameHeaderBytes", 2);
            node.put("tcpIpOverheadPerPacket", 40);
            node.put("ethernetMinFrame", 64);
            return ApiResponse.ok(node);
        });
    }

    private double round1(double v) { return Math.round(v * 10) / 10.0; }
}
