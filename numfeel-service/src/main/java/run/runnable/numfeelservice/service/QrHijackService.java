package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.model.QrHijackEntities.QrHijackSession;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 二维码劫持（QRLjacking）演示 — 业务逻辑层。
 * <p>
 * 核心流程：
 * 1. PC 端调用 createSession() 获取一个临时 token（模拟"网站生成登录二维码"）
 * 2. PC 端以 token 为内容展示二维码
 * 3. 手机扫码后调用 scan(token)，服务端标记该 session 为已扫码
 * 4. PC 端轮询 pollSession(token) 发现 status 变为 "scanned"，展示"劫持成功"
 * <p>
 * session 存储在内存 Cache 中（2分钟过期），同时持久化到 MySQL 做全局统计。
 */
@Service
public class QrHijackService {

    private static final Logger log = LoggerFactory.getLogger(QrHijackService.class);
    private static final long SESSION_TTL_MS = 120_000; // 2 分钟

    private final R2dbcEntityTemplate template;

    /** 内存缓存：token → SessionState（最多保留 5000 条，2 分钟过期） */
    private final Cache<String, SessionState> sessionCache = Caffeine.newBuilder()
            .maximumSize(5000)
            .expireAfterWrite(2, TimeUnit.MINUTES)
            .build();

    public QrHijackService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /** 创建新的登录 session */
    public Mono<Map<String, Object>> createSession() {
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        long now = System.currentTimeMillis();
        long expiresAt = now + SESSION_TTL_MS;

        SessionState state = new SessionState(token, "pending", null, now, expiresAt);
        sessionCache.put(token, state);

        // 持久化到 DB
        QrHijackSession entity = new QrHijackSession(
                null, token, "pending", "", now, 0L, false);
        return template.insert(QrHijackSession.class).using(entity)
                .thenReturn(Map.<String, Object>of(
                        "token", token,
                        "expiresAt", expiresAt,
                        "ttlSeconds", SESSION_TTL_MS / 1000
                ));
    }

    /** PC 端轮询 session 状态 */
    public Mono<Map<String, Object>> pollSession(String token) {
        SessionState state = sessionCache.getIfPresent(token);
        if (state == null) {
            return Mono.just(Map.of(
                    "status", "expired",
                    "message", "Session 已过期或不存在"
            ));
        }
        if (System.currentTimeMillis() > state.expiresAt) {
            sessionCache.invalidate(token);
            return Mono.just(Map.of(
                    "status", "expired",
                    "message", "Session 已过期"
            ));
        }
        if ("scanned".equals(state.status)) {
            return Mono.just(Map.of(
                    "status", "scanned",
                    "scannedBy", state.scannedBy != null ? state.scannedBy : "Unknown",
                    "message", "有人扫码了！Session 已被劫持"
            ));
        }
        long remainMs = state.expiresAt - System.currentTimeMillis();
        return Mono.just(Map.of(
                "status", "pending",
                "remainMs", Math.max(0, remainMs)
        ));
    }

    /** 手机扫码确认（模拟"受害者授权"） */
    public Mono<Map<String, Object>> scan(String token, String userAgent) {
        SessionState state = sessionCache.getIfPresent(token);
        if (state == null) {
            return Mono.just(Map.of(
                    "success", false,
                    "message", "Session 已过期或不存在"
            ));
        }
        if ("scanned".equals(state.status)) {
            return Mono.just(Map.of(
                    "success", false,
                    "message", "该码已被扫过"
            ));
        }

        // 更新内存状态
        String device = extractDevice(userAgent);
        SessionState updated = new SessionState(token, "scanned", device,
                state.createdAt, state.expiresAt);
        sessionCache.put(token, updated);

        // 更新 DB
        long now = System.currentTimeMillis();
        return ServiceSupport.selectAll(template, QrHijackSession.class)
                .flatMap(rows -> {
                    var match = rows.stream()
                            .filter(r -> token.equals(r.token()))
                            .findFirst();
                    if (match.isEmpty()) {
                        return Mono.empty();
                    }
                    QrHijackSession old = match.get();
                    QrHijackSession patched = new QrHijackSession(
                            old.id(), old.token(), "scanned", device,
                            old.createdAt(), now, true);
                    return template.update(patched);
                })
                .thenReturn(Map.<String, Object>of(
                        "success", true,
                        "message", "扫码成功！你刚刚「授权」了一次登录",
                        "device", device
                ));
    }

    /** 全局统计 */
    public Mono<Map<String, Object>> stats() {
        return ServiceSupport.selectAll(template, QrHijackSession.class)
                .map(rows -> {
                    long total = rows.size();
                    long scanned = rows.stream().filter(QrHijackSession::hijacked).count();
                    double hijackRate = total > 0
                            ? ServiceSupport.round(scanned * 100.0 / total, 1)
                            : 0.0;
                    return Map.<String, Object>of(
                            "totalSessions", total,
                            "scannedCount", scanned,
                            "hijackRate", hijackRate
                    );
                });
    }

    /** 从 User-Agent 提取简短设备描述 */
    private String extractDevice(String ua) {
        if (ua == null || ua.isBlank()) return "Unknown";
        if (ua.contains("iPhone")) return "iPhone";
        if (ua.contains("iPad")) return "iPad";
        if (ua.contains("Android")) {
            // 尝试提取型号
            int start = ua.indexOf("Android");
            int semi = ua.indexOf(';', start + 8);
            int paren = ua.indexOf(')', semi > 0 ? semi : start);
            if (semi > 0 && paren > semi) {
                String model = ua.substring(semi + 1, paren).trim();
                if (model.contains("Build")) {
                    model = model.substring(0, model.indexOf("Build")).trim();
                }
                if (!model.isEmpty() && model.length() < 30) return model;
            }
            return "Android 设备";
        }
        if (ua.contains("Windows")) return "Windows PC";
        if (ua.contains("Mac")) return "Mac";
        if (ua.contains("Linux")) return "Linux";
        return ua.length() > 40 ? ua.substring(0, 40) + "…" : ua;
    }

    /** 内存中的 session 状态 */
    private record SessionState(
            String token,
            String status,
            String scannedBy,
            long createdAt,
            long expiresAt
    ) {
    }
}
