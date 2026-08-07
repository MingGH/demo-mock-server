package run.runnable.numfeelservice.service;

import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.*;
import run.runnable.numfeelservice.web.ApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 知乎创作分析服务：拉取用户全部公开内容、聚合统计、生成词云。
 * <p>
 * 安全约束：Access Secret 只从请求头透传到知乎 API，不落日志、不落库、不缓存。
 */
@Service
public class ZhihuAnalyzeService {

    private static final Logger log = LoggerFactory.getLogger(ZhihuAnalyzeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String ZHIHU_API_BASE = "https://developer.zhihu.com";
    private static final int PAGE_SIZE = 50;
    private static final int MAX_PAGES = 200;

    private static final Set<String> STOP_WORDS = Set.of(
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
            "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
            "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何", "为什么",
            "可以", "还是", "这个", "那个", "只是", "因为", "所以", "但是", "如果", "虽然",
            "而且", "不过", "然后", "已经", "现在", "以后", "以前", "时候", "知道", "觉得",
            "认为", "想", "让", "做", "能", "会", "可能", "应该", "需要", "一定", "必须",
            "真的", "确实", "比较", "非常", "特别", "最", "更", "只", "才", "就", "又",
            "再", "还", "也", "都", "把", "被", "从", "以", "对", "与", "或", "等", "及",
            "之", "将", "向", "并", "而", "于", "中", "其", "为", "所", "者", "但",
            "关于", "还是", "其实", "终于", "然而", "因此", "于是", "此外", "另外",
            "一般", "一下", "一点", "一种", "一些", "一样", "一部分", "大部分",
            "不会", "不能", "不要", "不到", "不用", "不行", "不好", "不够",
            "有点", "有时", "有些", "有的", "的话", "来说", "来讲", "而言",
            "并不", "并非", "没错", "当然", "而且", "而是", "而是", "以及",
            "天津", "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉",
            "我们", "你们", "他们", "她们", "它们", "大家", "有人", "别人",
            "很多", "很少", "许多", "若干", "某个", "每个", "各个", "任何",
            "不断", "一个", "两个", "三个", "第一", "第二", "第三",
            "----", "---", "--", "**", "##", "```", "//", "??", "!!", "……"
    );

    private final WebClient zhihuWebClient;

    public ZhihuAnalyzeService() {
        this.zhihuWebClient = WebClient.builder()
                .baseUrl(ZHIHU_API_BASE)
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    /**
     * 拉取用户全部公开创作内容并分析。
     *
     * @param accessSecret 用户的知乎 Access Secret（仅透传，不落日志）
     * @return 分析结果
     */
    public Mono<AnalyzeResponse> analyze(String accessSecret) {
        return fetchAllItems(accessSecret)
                .flatMap(items -> {
                    if (items.isEmpty()) {
                        return Mono.just(buildEmptyResponse());
                    }
                    return Mono.fromCallable(() -> buildAnalyzeResponse(items))
                            .subscribeOn(Schedulers.boundedElastic());
                });
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

    private AnalyzeResponse buildEmptyResponse() {
        return new AnalyzeResponse(
                List.of(), 0, 0, 0, 0, 0, 0,
                Map.of(), Map.of(), Map.of(),
                List.of(), List.of(), List.of(),
                List.of(), List.of()
        );
    }

    private AnalyzeResponse buildAnalyzeResponse(List<ContentItem> items) {
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

    private List<WordCloudEntry> generateWordCloud(List<ContentItem> items) {
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