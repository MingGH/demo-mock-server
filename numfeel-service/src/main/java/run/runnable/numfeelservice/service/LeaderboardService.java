package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.cache.annotation.Cacheable;
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
 * 登录 Umami 统计后台，拉取近 24 小时 / 近 7 天 / 近 30 天 / 历史总榜四个口径的
 * 页面浏览量（{@code type=path}），清洗（剔除首页、广告变体、合并重复子路径、
 * 仅保留 {@code /pages/} 下的真实 demo）后返回结果。
 * <p>
 * 通过 {@link Cacheable} 注解 + CaffeineCacheManager(asyncMode) 实现 1 小时异步缓存，
 * 配合 {@code LeaderboardRefreshTask} 定时预热确保前端无冷缓存。
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
     * 获取排行榜数据。结果通过 @AsyncCacheable 自动缓存 1 小时。
     *
     * @return 四个口径的榜单及数据更新时间
     */
    @Cacheable(cacheNames = "leaderboard", sync = true)
    public Mono<LeaderboardResponse> getLeaderboard() {
        if (websiteId == null || websiteId.isBlank()
                || username == null || username.isBlank()
                || password == null || password.isBlank()) {
            return Mono.just(new LeaderboardResponse(List.of(), List.of(), List.of(), List.of(), 0L));
        }
        return login()
                .flatMap(this::fetchAllRanges)
                .doOnNext(resp -> log.info("Leaderboard fetched: 24h={}, 7d={}, 30d={}, all={}",
                        resp.last24Hours().size(), resp.last7Days().size(),
                        resp.last30Days().size(), resp.allTime().size()))
                .onErrorResume(err -> {
                    log.warn("Leaderboard fetch failed: {}", err.getMessage());
                    return Mono.just(new LeaderboardResponse(List.of(), List.of(), List.of(), List.of(), 0L));
                });
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

    /** 并发拉取四个口径并组装快照。 */
    private Mono<LeaderboardResponse> fetchAllRanges(String token) {
        long now = System.currentTimeMillis();
        return Mono.zip(
                        fetchRange(token, now - DAY_MS, now),
                        fetchRange(token, now - 7 * DAY_MS, now),
                        fetchRange(token, now - 30 * DAY_MS, now),
                        fetchRange(token, ALL_TIME_START_MS, now))
                .map(tuple -> new LeaderboardResponse(
                        tuple.getT1(), tuple.getT2(), tuple.getT3(), tuple.getT4(), now));
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
     * 清洗 Umami 返回的原始 path 指标。
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
     */
    static String normalizePath(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        path = path.trim();
        int hashIdx = path.indexOf('#');
        if (hashIdx != -1) {
            path = path.substring(0, hashIdx);
        }
        int queryIdx = path.indexOf('?');
        if (queryIdx != -1) {
            path = path.substring(0, queryIdx);
        }
        if (!path.startsWith("/pages/") || path.length() <= "/pages/".length()) {
            return null;
        }
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
