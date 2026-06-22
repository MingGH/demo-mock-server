package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.LeaderboardResponses.LeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.LeaderboardResponses.LeaderboardResponse;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Demo 热门排行榜服务。
 * <p>
 * 每小时定时登录 Umami 统计后台，拉取近 7 天 / 近 30 天 / 历史总榜三个口径的
 * 页面浏览量（{@code type=path}），清洗（剔除首页、广告变体、合并重复子路径、
 * 仅保留 {@code /pages/} 下的真实 demo）后构建内存快照。前端始终读取最新快照，
 * 因此无缓存空窗；若某次拉取失败，则保留上一次成功的快照（降级返回旧数据）。
 */
@Service
public class LeaderboardService {

    private static final Logger log = LoggerFactory.getLogger(LeaderboardService.class);

    /** 每个榜单返回的最大条目数。 */
    private static final int TOP_LIMIT = 20;
    /** 拉取时向 Umami 请求的原始条目数（多取以便清洗后仍够 TOP_LIMIT）。 */
    private static final int FETCH_LIMIT = 60;
    private static final long DAY_MS = 86_400_000L;
    /** 历史总榜起始时间：站点早于此时间无数据，取 2024-12-01 足够覆盖。 */
    private static final long ALL_TIME_START_MS = 1_733_011_200_000L;

    private final WebClient umamiWebClient;
    private final String websiteId;
    private final String username;
    private final String password;

    /** 当前对外提供的排行榜快照（volatile 保证可见性）。 */
    private volatile LeaderboardResponse snapshot =
            new LeaderboardResponse(List.of(), List.of(), List.of(), 0L);

    public LeaderboardService(@Qualifier("umamiWebClient") WebClient umamiWebClient,
                              @Value("${umami.website-id:}") String websiteId,
                              @Value("${umami.username:}") String username,
                              @Value("${umami.password:}") String password) {
        this.umamiWebClient = umamiWebClient;
        this.websiteId = websiteId;
        this.username = username;
        this.password = password;
        if (websiteId == null || websiteId.isBlank()
                || username == null || username.isBlank()
                || password == null || password.isBlank()) {
            log.warn("Umami leaderboard config incomplete (umami.website-id/username/password); "
                    + "leaderboard will stay empty until configured");
        }
    }

    /**
     * 返回当前排行榜快照（永不阻塞，永不抛错）。
     *
     * @return 三个口径的榜单及数据更新时间
     */
    public LeaderboardResponse getLeaderboard() {
        return snapshot;
    }

    /**
     * 定时刷新排行榜快照：每小时执行一次，启动后延迟 10 秒首次执行。
     */
    @Scheduled(initialDelay = 10_000L, fixedRate = 3_600_000L)
    public void refresh() {
        if (websiteId == null || websiteId.isBlank()
                || username == null || username.isBlank()
                || password == null || password.isBlank()) {
            return;
        }
        login()
                .flatMap(this::fetchAllRanges)
                .subscribe(
                        fresh -> {
                            snapshot = fresh;
                            log.info("Leaderboard snapshot refreshed: 7d={}, 30d={}, all={}",
                                    fresh.last7Days().size(), fresh.last30Days().size(),
                                    fresh.allTime().size());
                        },
                        err -> log.warn("Leaderboard refresh failed, keeping previous snapshot: {}",
                                err.getMessage())
                );
    }

    /** 登录 Umami 换取临时 token。 */
    private Mono<String> login() {
        return umamiWebClient.post()
                .uri("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", username, "password", password))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .handle((body, sink) -> {
                    if (body != null && body.has("token") && !body.get("token").isNull()) {
                        sink.next(body.get("token").asString());
                    } else {
                        sink.error(new IllegalStateException("Umami login returned no token"));
                    }
                });
    }

    /** 并发拉取三个口径并组装快照。 */
    private Mono<LeaderboardResponse> fetchAllRanges(String token) {
        long now = System.currentTimeMillis();
        return Mono.zip(
                        fetchRange(token, now - 7 * DAY_MS, now),
                        fetchRange(token, now - 30 * DAY_MS, now),
                        fetchRange(token, ALL_TIME_START_MS, now))
                .map(tuple -> new LeaderboardResponse(
                        tuple.getT1(), tuple.getT2(), tuple.getT3(), now));
    }

    /** 拉取单个时间窗的 path 指标并清洗为榜单条目。 */
    private Mono<List<LeaderboardEntry>> fetchRange(String token, long startAt, long endAt) {
        return umamiWebClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/websites/{id}/metrics")
                        .queryParam("type", "path")
                        .queryParam("startAt", startAt)
                        .queryParam("endAt", endAt)
                        .queryParam("limit", FETCH_LIMIT)
                        .build(websiteId))
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(LeaderboardService::cleanse);
    }

    /**
     * 清洗 Umami 返回的原始 path 指标：
     * <ul>
     *   <li>仅保留 {@code /pages/} 下的真实 demo（排除首页 {@code /}、其他根路径）；</li>
     *   <li>去除 {@code #} 之后的片段（如 {@code #google_vignette} 广告变体）；</li>
     *   <li>归一化为前端 demos.json 的匹配 key（去前导 {@code /}、去尾部 {@code /}、
     *       去 {@code .html} 后缀并转小写）；</li>
     *   <li>合并归一化后相同的路径浏览量；</li>
     *   <li>按浏览量降序，取前 {@link #TOP_LIMIT} 条。</li>
     * </ul>
     *
     * @param raw Umami 返回的 JSON 数组，每项形如 {@code {"x":"/pages/xxx","y":123}}
     * @return 清洗后的榜单条目列表
     */
    static List<LeaderboardEntry> cleanse(JsonNode raw) {
        Map<String, Long> merged = new LinkedHashMap<>();
        if (raw != null && raw.isArray()) {
            for (JsonNode item : raw) {
                String path = item.has("x") ? item.get("x").asString() : null;
                long views = item.has("y") ? item.get("y").asLong() : 0L;
                String normalized = normalizePath(path);
                if (normalized == null) {
                    continue;
                }
                merged.merge(normalized, views, Long::sum);
            }
        }
        List<LeaderboardEntry> entries = new ArrayList<>();
        merged.forEach((path, views) -> entries.add(new LeaderboardEntry(path, views)));
        entries.sort((a, b) -> Long.compare(b.views(), a.views()));
        return entries.size() > TOP_LIMIT ? new ArrayList<>(entries.subList(0, TOP_LIMIT)) : entries;
    }

    /**
     * 归一化单个路径。非 {@code /pages/} 下的路径返回 null（被剔除）。
     *
     * @param path 原始路径
     * @return 归一化后的 path key（如 {@code pages/xxx}），不合格返回 null
     */
    static String normalizePath(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        path = path.trim();
        // 去掉 query / hash 片段
        int hashIdx = path.indexOf('#');
        if (hashIdx != -1) {
            path = path.substring(0, hashIdx);
        }
        int queryIdx = path.indexOf('?');
        if (queryIdx != -1) {
            path = path.substring(0, queryIdx);
        }
        // 仅保留 /pages/ 下且路径段非空的真实 demo
        if (!path.startsWith("/pages/") || path.length() <= "/pages/".length()) {
            return null;
        }
        // 去前导斜杠，与 demos.json / 前端 normalizeKey 的匹配规则对齐
        path = path.substring(1);
        if (path.endsWith(".html")) {
            path = path.substring(0, path.length() - 5);
        }
        if (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        path = path.toLowerCase();
        return path.isBlank() || "pages".equals(path) ? null : path;
    }
}
