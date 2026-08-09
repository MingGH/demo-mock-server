package run.runnable.numfeelservice.controller.dto;

import java.util.List;
import java.util.Map;

/**
 * 知乎创作分析接口使用的响应 DTO。
 */
public final class ZhihuAnalyzeResponses {

    private ZhihuAnalyzeResponses() {
    }

    /**
     * 单条知乎创作内容。
     *
     * @param contentType  内容类型（article/answer/zvideo/pin/question）
     * @param url          内容链接
     * @param createdAt    创建时间（秒级时间戳）
     * @param likeCount    点赞数
     * @param commentCount 评论数
     * @param favoriteCount 收藏数
     * @param title        标题
     * @param summary      摘要
     */
    public record ContentItem(
            String contentType,
            String url,
            long createdAt,
            long likeCount,
            long commentCount,
            long favoriteCount,
            String title,
            String summary
    ) {
    }

    /**
     * 词云条目。
     *
     * @param word  词语
     * @param count 出现次数
     */
    public record WordCloudEntry(
            String word,
            int count
    ) {
    }

    /**
     * 年度统计。
     *
     * @param year       年份
     * @param count      内容数量
     * @param likes      点赞总数
     * @param comments   评论总数
     * @param favorites  收藏总数
     */
    public record YearlyStat(
            int year,
            int count,
            long likes,
            long comments,
            long favorites
    ) {
    }

    /**
     * 分析结果响应。
     *
     * @param items          全部创作内容列表
     * @param total          内容总数
     * @param firstCreated   最早创作时间（秒级时间戳）
     * @param lastCreated    最近创作时间（秒级时间戳）
     * @param totalLikes     点赞总数
     * @param totalComments  评论总数
     * @param totalFavorites 收藏总数
     * @param byType         按内容类型分布
     * @param byYear         按年份分布
     * @param byMonth        按月份分布
     * @param topLiked       点赞最多的 10 篇
     * @param topCommented   评论最多的 10 篇
     * @param topFavorited   收藏最多的 10 篇
     * @param wordCloud      词云数据
     * @param yearlyStats    年度详细统计
     * @param followStats    关注画像（无数据时 followStats.total=0）
     * @param collectionStats 收藏画像（无数据时各字段为空/0）
     */
    public record AnalyzeResponse(
            List<ContentItem> items,
            int total,
            long firstCreated,
            long lastCreated,
            long totalLikes,
            long totalComments,
            long totalFavorites,
            Map<String, Integer> byType,
            Map<String, Integer> byYear,
            Map<String, Integer> byMonth,
            List<ContentItem> topLiked,
            List<ContentItem> topCommented,
            List<ContentItem> topFavorited,
            List<WordCloudEntry> wordCloud,
            List<YearlyStat> yearlyStats,
            FollowStats followStats,
            CollectionStats collectionStats
    ) {
        /** 兼容旧调用：不带关注/收藏画像时用空数据。 */
        public AnalyzeResponse(
                List<ContentItem> items,
                int total,
                long firstCreated,
                long lastCreated,
                long totalLikes,
                long totalComments,
                long totalFavorites,
                Map<String, Integer> byType,
                Map<String, Integer> byYear,
                Map<String, Integer> byMonth,
                List<ContentItem> topLiked,
                List<ContentItem> topCommented,
                List<ContentItem> topFavorited,
                List<WordCloudEntry> wordCloud,
                List<YearlyStat> yearlyStats) {
            this(items, total, firstCreated, lastCreated, totalLikes, totalComments, totalFavorites,
                    byType, byYear, byMonth, topLiked, topCommented, topFavorited, wordCloud, yearlyStats,
                    new FollowStats(0, List.of()),
                    new CollectionStats(0, 0, List.of(), Map.of(), List.of()));
        }
    }

    /**
     * 关注画像。
     *
     * @param total 关注总数（Paging.Totals）
     * @param top   粉丝数最多的关注对象（最多 8 个）
     */
    public record FollowStats(
            long total,
            List<FolloweeEntry> top
    ) {
    }

    /**
     * 单个关注对象。
     *
     * @param fullname      用户名
     * @param urlToken      主页标识
     * @param url           主页链接
     * @param avatarUrl     头像
     * @param headline      一句话介绍
     * @param followerCount 粉丝数
     */
    public record FolloweeEntry(
            String fullname,
            String urlToken,
            String url,
            String avatarUrl,
            String headline,
            long followerCount
    ) {
    }

    /**
     * 收藏画像。
     *
     * @param totalCollected 近期可获取的收藏内容总数
     * @param favlistCount   收藏夹数量
     * @param favlists       收藏夹列表（含公开标记）
     * @param byType         收藏内容类型分布
     * @param recent         最近收藏的内容（按收藏时间倒序，最多 8 条）
     */
    public record CollectionStats(
            long totalCollected,
            long favlistCount,
            List<FavlistEntry> favlists,
            Map<String, Integer> byType,
            List<CollectionEntry> recent
    ) {
    }

    /**
     * 收藏夹。
     *
     * @param urlToken 收藏夹 URL 标识
     * @param title    收藏夹名称
     * @param isPublic 是否公开
     */
    public record FavlistEntry(
            String urlToken,
            String title,
            boolean isPublic
    ) {
    }

    /**
     * 单条收藏内容。
     *
     * @param contentType  内容类型
     * @param url          内容链接
     * @param favTime      收藏时间（秒级时间戳）
     * @param likeCount    点赞数
     * @param title        标题
     * @param authorName   作者名称
     * @param favlistTitles 内容所在收藏夹名称列表（用于过滤公开收藏夹）
     */
    public record CollectionEntry(
            String contentType,
            String url,
            long favTime,
            long likeCount,
            String title,
            String authorName,
            List<String> favlistTitles
    ) {
    }

    /**
     * 缓存命中信息。
     *
     * @param cached     true=本次来自缓存，false=本次刚刚从知乎拉取
     * @param cachedAt   数据首次落盘的时间（秒级时间戳）
     * @param expiresAt  缓存失效时间（秒级时间戳）
     * @param ttlSeconds 缓存总寿命（秒）
     */
    public record CacheInfo(
            boolean cached,
            long cachedAt,
            long expiresAt,
            int ttlSeconds
    ) {
    }

    /**
     * 服务层返回结构：分析数据 + 缓存元信息。
     */
    public record CachedResult(
            AnalyzeResponse data,
            CacheInfo cache
    ) {
    }
}

