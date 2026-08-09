package run.runnable.numfeelservice.service;

import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.netty.channel.ChannelOption;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;
import run.runnable.numfeelservice.config.CacheConfig;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.*;
import run.runnable.numfeelservice.web.ApiException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 知乎创作分析服务：拉取用户全部公开内容、聚合统计、生成词云。
 * <p>
 * 安全约束：Access Secret 只从请求头透传到知乎 API，不落日志、不落库。
 * 缓存键使用 SHA-256(token) 前 16 字节的十六进制（见
 * {@link CacheConfig#zhihuTokenKeyGenerator()}），明文不进堆。
 * <p>
 * 缓存策略：每个 token 的分析结果通过 Spring Cache（{@link Cacheable} +
 * {@code CaffeineCacheManager(asyncMode)}）在内存里保留 15 分钟；期间内再次
 * 请求直接走缓存，节省知乎 API 配额。强制刷新：{@code ?force=true} 时先 evict
 * 已有缓存项，再重新拉取并写回，后续 15 分钟仍走缓存。
 */
@Service
public class ZhihuAnalyzeService {

    private static final Logger log = LoggerFactory.getLogger(ZhihuAnalyzeService.class);
    private static final String ZHIHU_API_BASE = "https://developer.zhihu.com";
    private static final String CACHE_NAME = "zhihuAnalyze";
    private static final int PAGE_SIZE = 50;
    private static final int MAX_PAGES = 200;
    /** 缓存 TTL：15 分钟。和 CacheConfig 里 zhihuAnalyze 的 expireAfterWrite 保持一致。 */
    private static final int CACHE_TTL_SECONDS = 15 * 60;

    private static final Set<String> STOP_WORDS = Set.copyOf(java.util.List.of(
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
            "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
            "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何", "为什么",
            "可以", "还是", "这个", "那个", "只是", "因为", "所以", "但是", "如果", "虽然",
            "而且", "不过", "然后", "已经", "现在", "以后", "以前", "时候", "知道", "觉得",
            "认为", "想", "让", "做", "能", "可能", "应该", "需要", "一定", "必须",
            "真的", "确实", "比较", "非常", "特别", "最", "更", "只", "才", "又",
            "再", "还", "把", "被", "从", "以", "对", "与", "或", "等", "及",
            "之", "将", "向", "并", "而", "于", "中", "其", "为", "所", "者", "但",
            "关于", "其实", "终于", "然而", "因此", "于是", "此外", "另外",
            "一般", "一下", "一点", "一种", "一些", "一样", "一部分", "大部分",
            "不会", "不能", "不要", "不到", "不用", "不行", "不好", "不够",
            "有点", "有时", "有些", "有的", "的话", "来说", "来讲", "而言",
            "并不", "并非", "没错", "当然", "而是", "以及",
            "我们", "你们", "他们", "她们", "它们", "大家", "有人", "别人",
            "很多", "很少", "许多", "若干", "某个", "每个", "各个", "任何",
            "不断", "两个", "三个", "第一", "第二", "第三","使用","不是",
            "----", "---", "--", "**", "##", "```", "//", "??", "!!", "……",
            // 知乎正文常见噪声词，对数据分析无意义
            "图片", "一张", "一下", "这样", "那样", "什么", "怎么", "这里", "那里",
            "比如", "其实", "觉得", "应该", "可能", "发现", "看到", "那么", "这么",
            "其中", "之间", "之后", "之前", "里面", "以外", "以内", "以上", "以下",
            "一点", "一会", "一会", "一会", "下来", "上来", "出去", "进来", "回来",
            "时候", "时候", "用户", "内容", "回答", "问题", "文章", "视频", "想法"
    ));

    private final WebClient zhihuWebClient;
    private final CacheManager cacheManager;
    /** 自注入代理：让内部调用 {@link #fetchAndCache(String, boolean)} 时仍然走 Spring AOP，触发 @Cacheable。 */
    private final ZhihuAnalyzeService self;

    public ZhihuAnalyzeService(CacheManager cacheManager, @Lazy ZhihuAnalyzeService self) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000)
                .responseTimeout(Duration.ofSeconds(30));
        this.zhihuWebClient = WebClient.builder()
                .baseUrl(ZHIHU_API_BASE)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
        this.cacheManager = cacheManager;
        this.self = self;
    }

    /**
     * 拉取用户全部公开创作内容并分析。
     * <p>
     * 命中缓存时直接返回（{@code CachedResult.cache.cached=true}，cachedAt/expiresAt 保持首次落盘的时间）。
     * 拉取知乎数据较慢时建议前端用 {@code force=true} 强制刷新，
     * 缓存会立即失效并重新拉取。
     *
     * @param accessSecret 用户的知乎 Access Secret（仅透传，不落日志）
     * @param force        true=跳过缓存，强制从知乎重新拉取
     * @return 分析结果 + 缓存元信息
     */
    public Mono<CachedResult> analyze(String accessSecret, boolean force) {
        if (force) {
            Cache cache = cacheManager.getCache(CACHE_NAME);
            if (cache != null) {
                cache.evict(CacheConfig.hashToken(accessSecret));
                log.info("zhihu analyze: force refresh, cache evicted");
            }
        }
        long preCallTime = Instant.now().getEpochSecond();
        return self.fetchAndCache(accessSecret, force)
                .map(result -> {
                    // Spring Cache 在缓存命中时直接返回原值，方法体不执行。
                    // 用 preCallTime 区分：cachedAt < preCallTime 即命中。
                    if (force) {
                        return result;
                    }
                    CacheInfo info = result.cache();
                    if (info.cachedAt() >= preCallTime) {
                        return result;  // fresh
                    }
                    return new CachedResult(result.data(),
                            new CacheInfo(true, info.cachedAt(), info.expiresAt(), info.ttlSeconds()));
                });
    }

    /**
     * 实际被 Spring Cache 代理的方法。方法体只会在缓存未命中时执行。
     * <p>
     * 缓存键：{@link CacheConfig#zhihuTokenKeyGenerator()} 对第一个参数做 SHA-256 截断，
     * token 明文不会进入缓存键。强制刷新由 {@link #analyze(String, boolean)} 先 evict
     * 缓存，本方法随后照常写入新结果，保证后续 15 分钟内命中缓存。
     * {@code sync = true} 防止同一 key 的并发请求重复穿透到知乎 API。
     *
     * @param accessSecret 用户的知乎 Access Secret
     * @param force        true 时调用方已 evict 缓存，本方法会重新拉取并覆盖写回
     * @return 分析结果 + 缓存元信息
     */
    @Cacheable(cacheNames = CACHE_NAME,
            keyGenerator = "zhihuTokenKeyGenerator",
            sync = true)
    public Mono<CachedResult> fetchAndCache(String accessSecret, boolean force) {
        long now = Instant.now().getEpochSecond();
        return fetchAllItems(accessSecret)
                .flatMap(items -> {
                    if (items.isEmpty()) {
                        return Mono.just(buildEmptyCachedResult(now));
                    }
                    return Mono.fromCallable(() -> {
                                AnalyzeResponse data = buildAnalyzeResponse(items, accessSecret);
                                return new CachedResult(data, freshCacheInfo(now));
                            })
                            .subscribeOn(Schedulers.boundedElastic());
                });
    }

    private CachedResult buildEmptyCachedResult(long cachedAt) {
        return new CachedResult(buildEmptyResponse(), freshCacheInfo(cachedAt));
    }

    /**
     * 构造全零 AnalyzeResponse：账号无任何公开内容时使用。
     */
    protected AnalyzeResponse buildEmptyResponse() {
        return new AnalyzeResponse(
                List.of(), 0, 0, 0, 0, 0, 0,
                Map.of(), Map.of(), Map.of(),
                List.of(), List.of(), List.of(),
                List.of(), List.of()
        );
    }

    private static CacheInfo freshCacheInfo(long cachedAt) {
        return new CacheInfo(false, cachedAt, cachedAt + CACHE_TTL_SECONDS, CACHE_TTL_SECONDS);
    }

    /**
     * 分页拉取全部内容，最多 {@value MAX_PAGES} 页。
     */
    private Mono<List<ContentItem>> fetchAllItems(String accessSecret) {
        return fetchPage(accessSecret, 0, new ArrayList<>(), 0);
    }

    private Mono<List<ContentItem>> fetchPage(String accessSecret, long offset,
                                               List<ContentItem> accumulator, int pageCount) {
        if (pageCount >= MAX_PAGES) {
            log.warn("zhihu analyze: reached max pages limit {}", MAX_PAGES);
            return Mono.just(accumulator);
        }
        long now = Instant.now().getEpochSecond();
        return zhihuWebClient.get()
                .uri(builder -> builder.path("/api/v1/user/contents")
                        .queryParam("ContentType", "all")
                        .queryParam("Limit", PAGE_SIZE)
                        .queryParam("Offset", offset)
                        .queryParam("SortField", "ts")
                        .queryParam("SortOrder", "desc")
                        .build())
                .header("Authorization", "Bearer " + accessSecret)
                .header("X-Request-Timestamp", String.valueOf(now))
                .header("Content-Type", "application/json")
                .retrieve()
                .bodyToMono(JsonNode.class)
                .flatMap(response -> {
                    int code = response.path("Code").asInt(-1);
                    if (code != 0) {
                        String message = response.path("Message").asText("unknown");
                        return switch (code) {
                            case 20001 -> Mono.error(ApiException.badRequest("知乎 Access Secret 无效，请检查后重试"));
                            case 30001 -> Mono.error(new ApiException(429, "知乎 API 频率限制，请稍后重试"));
                            case 30002 -> Mono.error(new ApiException(429, "知乎 API 配额已用尽，请稍后重试"));
                            default -> Mono.error(new ApiException(502, "知乎 API 错误: " + message));
                        };
                    }
                    JsonNode data = response.path("Data");
                    JsonNode itemsNode = data.path("Items");
                    JsonNode paging = data.path("Paging");
                    boolean isEnd = paging.path("IsEnd").asBoolean(true);
                    long nextOffset;
                    try {
                        nextOffset = Long.parseLong(paging.path("NextOffset").asText("0"));
                    } catch (NumberFormatException e) {
                        nextOffset = offset + PAGE_SIZE;
                    }

                    List<ContentItem> pageItems = new ArrayList<>();
                    for (JsonNode item : itemsNode) {
                        pageItems.add(new ContentItem(
                                item.path("ContentType").asText(""),
                                item.path("Url").asText(""),
                                item.path("CreatedAt").asLong(0),
                                item.path("LikeCount").asLong(0),
                                item.path("CommentCount").asLong(0),
                                item.path("FavoriteCount").asLong(0),
                                item.path("Title").asText(""),
                                item.path("Summary").asText("")
                        ));
                    }
                    accumulator.addAll(pageItems);
                    log.info("zhihu analyze: fetched page {} ({} items, total {})", pageCount + 1, pageItems.size(), accumulator.size());

                    if (isEnd || pageItems.isEmpty()) {
                        return Mono.just(accumulator);
                    }
                    return fetchPage(accessSecret, nextOffset, accumulator, pageCount + 1);
                })
                .onErrorResume(ApiException.class, Mono::error)
                .onErrorResume(e -> {
                    log.warn("zhihu analyze: network error fetching page {}: {}", pageCount + 1, e.getMessage());
                    return Mono.error(new ApiException(502, "网络请求失败，请检查网络后重试"));
                });
    }

    protected AnalyzeResponse buildAnalyzeResponse(List<ContentItem> items) {
        int total = items.size();
        long firstCreated = items.stream().mapToLong(ContentItem::createdAt).min().orElse(0);
        long lastCreated = items.stream().mapToLong(ContentItem::createdAt).max().orElse(0);
        long totalLikes = items.stream().mapToLong(ContentItem::likeCount).sum();
        long totalComments = items.stream().mapToLong(ContentItem::commentCount).sum();
        long totalFavorites = items.stream().mapToLong(ContentItem::favoriteCount).sum();

        Map<String, Integer> byType = items.stream()
                .collect(Collectors.groupingBy(ContentItem::contentType, Collectors.summingInt(i -> 1)));

        DateTimeFormatter yearFmt = DateTimeFormatter.ofPattern("yyyy").withZone(ZoneId.of("Asia/Shanghai"));
        DateTimeFormatter monthFmt = DateTimeFormatter.ofPattern("yyyy-MM").withZone(ZoneId.of("Asia/Shanghai"));
        Map<String, Integer> byYear = new LinkedHashMap<>();
        Map<String, Integer> byMonth = new LinkedHashMap<>();
        for (ContentItem item : items) {
            Instant instant = Instant.ofEpochSecond(item.createdAt());
            byYear.merge(yearFmt.format(instant), 1, Integer::sum);
            byMonth.merge(monthFmt.format(instant), 1, Integer::sum);
        }

        List<ContentItem> topLiked = items.stream()
                .sorted(Comparator.comparingLong(ContentItem::likeCount).reversed())
                .limit(10).toList();
        List<ContentItem> topCommented = items.stream()
                .sorted(Comparator.comparingLong(ContentItem::commentCount).reversed())
                .limit(10).toList();
        List<ContentItem> topFavorited = items.stream()
                .sorted(Comparator.comparingLong(ContentItem::favoriteCount).reversed())
                .limit(10).toList();

        List<WordCloudEntry> wordCloud = generateWordCloud(items);

        Map<Integer, YearlyStat> yearlyMap = new LinkedHashMap<>();
        for (ContentItem item : items) {
            int year = Integer.parseInt(yearFmt.format(Instant.ofEpochSecond(item.createdAt())));
            YearlyStat stat = yearlyMap.getOrDefault(year,
                    new YearlyStat(year, 0, 0, 0, 0));
            yearlyMap.put(year, new YearlyStat(
                    year,
                    stat.count() + 1,
                    stat.likes() + item.likeCount(),
                    stat.comments() + item.commentCount(),
                    stat.favorites() + item.favoriteCount()
            ));
        }
        List<YearlyStat> yearlyStats = yearlyMap.values().stream()
                .sorted(Comparator.comparingInt(YearlyStat::year))
                .toList();

        return new AnalyzeResponse(
                items, total, firstCreated, lastCreated,
                totalLikes, totalComments, totalFavorites,
                byType, byYear, byMonth,
                topLiked, topCommented, topFavorited,
                wordCloud, yearlyStats
        );
    }

    /**
     * 与 {@link #buildAnalyzeResponse(List)} 相同，但额外拉取关注列表与收藏数据，
     * 用于补充「关注画像」与「收藏画像」两个展示维度。
     * <p>
     * 关注/收藏接口属于「尽力而为」：拉取失败或字段缺失时返回空画像，不影响主分析。
     */
    protected AnalyzeResponse buildAnalyzeResponse(List<ContentItem> items, String accessSecret) {
        AnalyzeResponse base = buildAnalyzeResponse(items);
        FollowStats followStats = fetchFollowStats(accessSecret);
        CollectionStats collectionStats = fetchCollectionStats(accessSecret);
        return new AnalyzeResponse(
                base.items(), base.total(), base.firstCreated(), base.lastCreated(),
                base.totalLikes(), base.totalComments(), base.totalFavorites(),
                base.byType(), base.byYear(), base.byMonth(),
                base.topLiked(), base.topCommented(), base.topFavorited(),
                base.wordCloud(), base.yearlyStats(),
                followStats, collectionStats
        );
    }

    // ====== 关注画像 ======

    private FollowStats fetchFollowStats(String accessSecret) {
        try {
            JsonNode resp = zhihuWebClient.get()
                    .uri(builder -> builder.path("/api/v1/user/followees").queryParam("Limit", 50).build())
                    .header("Authorization", "Bearer " + accessSecret)
                    .header("X-Request-Timestamp", String.valueOf(Instant.now().getEpochSecond()))
                    .header("Content-Type", "application/json")
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(20));
            if (resp == null || resp.path("Code").asInt(-1) != 0) {
                return new FollowStats(0, List.of());
            }
            JsonNode data = resp.path("Data");
            long total = data.path("Paging").path("Totals").asLong(0);
            List<FolloweeEntry> all = new ArrayList<>();
            for (JsonNode it : data.path("Items")) {
                all.add(new FolloweeEntry(
                        it.path("Fullname").asText(""),
                        it.path("UrlToken").asText(""),
                        it.path("Url").asText(""),
                        it.path("AvatarUrl").asText(""),
                        it.path("Headline").asText(""),
                        it.path("FollowerCount").asLong(0)
                ));
            }
            List<FolloweeEntry> top = all.stream()
                    .sorted(Comparator.comparingLong(FolloweeEntry::followerCount).reversed())
                    .limit(8)
                    .toList();
            return new FollowStats(total, top);
        } catch (Exception e) {
            log.warn("zhihu analyze: followees fetch failed: {}", e.getMessage());
            return new FollowStats(0, List.of());
        }
    }

    // ====== 收藏画像 ======

    private CollectionStats fetchCollectionStats(String accessSecret) {
        List<FavlistEntry> favlists = fetchFavlistsSync(accessSecret);
        List<CollectionEntry> collections = fetchCollectionsSync(accessSecret);
        if (collections.isEmpty() && favlists.isEmpty()) {
            return new CollectionStats(0, 0, List.of(), Map.of(), List.of());
        }
        Map<String, Integer> byType = new LinkedHashMap<>();
        for (CollectionEntry entry : collections) {
            byType.merge(entry.contentType(), 1, Integer::sum);
        }
        List<CollectionEntry> recent = collections.stream()
                .sorted(Comparator.comparingLong(CollectionEntry::favTime).reversed())
                .limit(8)
                .toList();
        return new CollectionStats(
                collections.size(),
                favlists.size(),
                favlists,
                byType,
                recent
        );
    }

    private List<FavlistEntry> fetchFavlistsSync(String accessSecret) {
        try {
            JsonNode resp = zhihuWebClient.get()
                    .uri(builder -> builder.path("/api/v1/user/favlists").queryParam("Limit", 50).build())
                    .header("Authorization", "Bearer " + accessSecret)
                    .header("X-Request-Timestamp", String.valueOf(Instant.now().getEpochSecond()))
                    .header("Content-Type", "application/json")
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(20));
            if (resp == null || resp.path("Code").asInt(-1) != 0) {
                return List.of();
            }
            List<FavlistEntry> list = new ArrayList<>();
            for (JsonNode it : resp.path("Data").path("Items")) {
                list.add(new FavlistEntry(
                        String.valueOf(it.path("UrlToken").asLong(0)),
                        it.path("Title").asText(""),
                        it.path("IsPublic").asBoolean(false)
                ));
            }
            return list;
        } catch (Exception e) {
            log.warn("zhihu analyze: favlists fetch failed: {}", e.getMessage());
            return List.of();
        }
    }

    private List<CollectionEntry> fetchCollectionsSync(String accessSecret) {
        try {
            JsonNode resp = zhihuWebClient.get()
                    .uri(builder -> builder.path("/api/v1/user/collections").queryParam("Limit", 50).build())
                    .header("Authorization", "Bearer " + accessSecret)
                    .header("X-Request-Timestamp", String.valueOf(Instant.now().getEpochSecond()))
                    .header("Content-Type", "application/json")
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(Duration.ofSeconds(20));
            if (resp == null || resp.path("Code").asInt(-1) != 0) {
                return List.of();
            }
            List<CollectionEntry> list = new ArrayList<>();
            for (JsonNode it : resp.path("Data").path("Items")) {
                List<String> favlistTitles = new ArrayList<>();
                for (JsonNode fl : it.path("Favlists")) {
                    String t = fl.path("Title").asText("");
                    if (!t.isEmpty()) favlistTitles.add(t);
                }
                list.add(new CollectionEntry(
                        it.path("ContentType").asText(""),
                        it.path("Url").asText(""),
                        it.path("FavTime").asLong(0),
                        it.path("LikeCount").asLong(0),
                        it.path("Title").asText(""),
                        it.path("Author").path("Name").asText(""),
                        favlistTitles
                ));
            }
            return list;
        } catch (Exception e) {
            log.warn("zhihu analyze: collections fetch failed: {}", e.getMessage());
            return List.of();
        }
    }

    protected List<WordCloudEntry> generateWordCloud(List<ContentItem> items) {
        JiebaSegmenter segmenter = new JiebaSegmenter();
        Map<String, Integer> wordCounts = new HashMap<>();

        for (ContentItem item : items) {
            String text = item.title() + " " + item.summary();
            if (text.isBlank()) continue;
            for (SegToken token : segmenter.process(text, JiebaSegmenter.SegMode.SEARCH)) {
                String word = token.word.trim();
                if (word.isEmpty() || word.length() < 2) continue;
                if (STOP_WORDS.contains(word)) continue;
                if (word.matches("-?\\d+(\\.\\d+)?")) continue;
                if (word.matches("[\\p{Punct}\\p{IsPunctuation}]+")) continue;
                wordCounts.merge(word, 1, Integer::sum);
            }
        }

        return wordCounts.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .limit(200)
                .map(e -> new WordCloudEntry(e.getKey(), e.getValue()))
                .toList();
    }
}

