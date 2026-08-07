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
            List<YearlyStat> yearlyStats
    ) {
    }
}