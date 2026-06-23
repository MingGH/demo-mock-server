package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 「外链头像安全实验室」业务层。
 * <p>
 * 给每个访客发一个唯一的头像 token（UUID），并允许通过场景开关动态切换该 token
 * 对应的"恶意行为"，让用户像踩雷一样去理解：把别人服务器上的 URL 直接拿来当
 * &lt;img src&gt; 到底有哪些风险。
 * <p>
 * 状态只保存在内存缓存里，30 分钟过期；不入库，避免演示数据污染。
 */
@Service
public class AvatarRiskService {

    private static final Logger log = LoggerFactory.getLogger(AvatarRiskService.class);

    /** 单个 token 的存活时间。 */
    private static final long TTL_MINUTES = 30;

    /** 单个 token 最多保留多少条访问日志，超出后丢弃最早的一条。 */
    private static final int MAX_LOG_PER_TOKEN = 50;

    /** token → 当前场景状态。 */
    private final Cache<String, ScenarioState> sessions = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(TTL_MINUTES, TimeUnit.MINUTES)
            .build();

    /** token → 访问日志（FIFO）。 */
    private final Cache<String, List<AccessLog>> logs = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(TTL_MINUTES, TimeUnit.MINUTES)
            .build();

    /** 全局统计：场景被触发的次数。 */
    private final AtomicReference<Map<String, Long>> globalCounts = new AtomicReference<>(
            Map.of("totalSessions", 0L, "totalFetches", 0L));

    /** 创建新 session：返回 token + 头像直链。 */
    public Mono<Map<String, Object>> createSession() {
        String token = UUID.randomUUID().toString().replace("-", "");
        sessions.put(token, ScenarioState.defaults());
        bumpGlobal("totalSessions");
        return Mono.just(Map.of(
                "token", token,
                "avatarPath", "/avatar-risk/avatar/" + token,
                "ttlSeconds", TTL_MINUTES * 60
        ));
    }

    /** 切换某个场景开关。 */
    public Mono<Map<String, Object>> toggleScenario(String token, String scenario, boolean enabled) {
        ScenarioState state = sessions.getIfPresent(token);
        if (state == null) {
            return Mono.just(Map.of("success", false, "message", "Session 已过期，请刷新页面"));
        }
        ScenarioState next = state.with(scenario, enabled);
        sessions.put(token, next);
        return Mono.just(Map.of(
                "success", true,
                "scenarios", next.asMap()
        ));
    }

    /** 查询当前场景状态。 */
    public Mono<Map<String, Object>> getState(String token) {
        ScenarioState state = sessions.getIfPresent(token);
        if (state == null) {
            return Mono.just(Map.of("exists", false));
        }
        return Mono.just(Map.of(
                "exists", true,
                "scenarios", state.asMap()
        ));
    }

    /** 取一次头像加载策略：由 Controller 决定如何响应。 */
    public ScenarioState resolveForFetch(String token, String ip, String userAgent, String referer) {
        ScenarioState state = sessions.getIfPresent(token);
        if (state == null) {
            return null;
        }
        // 记录访问日志（即使是合法访问也记下来，体现"图片URL也会泄露IP/UA/Referer"）
        appendLog(token, new AccessLog(System.currentTimeMillis(), ip, userAgent, referer));
        bumpGlobal("totalFetches");
        return state;
    }

    /** 获取访问日志（演示"图片URL会泄露访客信息"）。 */
    public Mono<Map<String, Object>> getLogs(String token) {
        List<AccessLog> list = logs.getIfPresent(token);
        if (list == null) {
            return Mono.just(Map.of("logs", List.of()));
        }
        List<Map<String, Object>> rendered = new ArrayList<>();
        synchronized (list) {
            for (AccessLog l : list) {
                rendered.add(Map.of(
                        "at", l.at,
                        "ip", l.ip,
                        "userAgent", l.userAgent,
                        "referer", l.referer
                ));
            }
        }
        return Mono.just(Map.of("logs", rendered, "count", rendered.size()));
    }

    /** 全局统计。 */
    public Mono<Map<String, Object>> stats() {
        Map<String, Long> snapshot = globalCounts.get();
        return Mono.just(Map.<String, Object>of(
                "totalSessions", snapshot.getOrDefault("totalSessions", 0L),
                "totalFetches", snapshot.getOrDefault("totalFetches", 0L)
        ));
    }

    private void appendLog(String token, AccessLog entry) {
        List<AccessLog> list = logs.get(token, k -> new ArrayList<>());
        if (list == null) return;
        synchronized (list) {
            list.add(entry);
            while (list.size() > MAX_LOG_PER_TOKEN) {
                list.remove(0);
            }
        }
    }

    private void bumpGlobal(String key) {
        globalCounts.updateAndGet(prev -> {
            Map<String, Long> next = new LinkedHashMap<>(prev);
            next.merge(key, 1L, Long::sum);
            return next;
        });
    }

    /** 单次访问日志条目。 */
    private record AccessLog(long at, String ip, String userAgent, String referer) {
    }

    /**
     * 场景开关集合。
     * <ul>
     *   <li>horror: 把头像替换为恐怖图片（演示"外链内容随时可被替换"）</li>
     *   <li>redirect: 302 跳转到 localhost:8080（演示"伪图片URL其实是攻击载荷"）</li>
     *   <li>authPrompt: 返回 401 + WWW-Authenticate，浏览器弹账号密码框（演示"钓鱼弹窗"）</li>
     *   <li>slow: 故意延迟 8 秒响应（演示"外链拖垮页面"）</li>
     *   <li>oversized: 返回一个巨大图片（演示"流量炸弹"）</li>
     *   <li>broken: 直接 404（演示"外链失效"）</li>
     * </ul>
     */
    public record ScenarioState(
            boolean horror,
            boolean redirect,
            boolean authPrompt,
            boolean slow,
            boolean oversized,
            boolean broken
    ) {

        public static ScenarioState defaults() {
            return new ScenarioState(false, false, false, false, false, false);
        }

        public ScenarioState with(String key, boolean value) {
            return switch (key) {
                case "horror"     -> new ScenarioState(value, redirect, authPrompt, slow, oversized, broken);
                case "redirect"   -> new ScenarioState(horror, value, authPrompt, slow, oversized, broken);
                case "authPrompt" -> new ScenarioState(horror, redirect, value, slow, oversized, broken);
                case "slow"       -> new ScenarioState(horror, redirect, authPrompt, value, oversized, broken);
                case "oversized"  -> new ScenarioState(horror, redirect, authPrompt, slow, value, broken);
                case "broken"     -> new ScenarioState(horror, redirect, authPrompt, slow, oversized, value);
                default -> this;
            };
        }

        public Map<String, Boolean> asMap() {
            Map<String, Boolean> m = new LinkedHashMap<>();
            m.put("horror", horror);
            m.put("redirect", redirect);
            m.put("authPrompt", authPrompt);
            m.put("slow", slow);
            m.put("oversized", oversized);
            m.put("broken", broken);
            return m;
        }
    }
}
