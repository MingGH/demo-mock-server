package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.controller.dto.ZhihuAnalyzeResponses.*;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ZhihuAnalyzeService 单元测试：直接用 {@code new ZhihuAnalyzeService(null, null)}
 * 跳过 DI 依赖，访问 protected 方法，测试纯计算逻辑（聚合统计、词云），不依赖网络。
 * 注意：不能调用 {@code analyze()}（cacheManager/self 为 null）。
 */
class ZhihuAnalyzeServiceTest {

    private ZhihuAnalyzeService service;

    @BeforeEach
    void setUp() {
        service = new ZhihuAnalyzeService(null, null);
    }

    @Test
    void buildEmptyResponse_returns_zero_totals() {
        AnalyzeResponse response = service.buildEmptyResponse();
        assertEquals(0, response.total());
        assertEquals(0, response.totalLikes());
        assertEquals(0, response.totalComments());
        assertEquals(0, response.totalFavorites());
        assertTrue(response.items().isEmpty());
        assertTrue(response.wordCloud().isEmpty());
        assertTrue(response.yearlyStats().isEmpty());
    }

    @Test
    void buildAnalyzeResponse_aggregates_correctly() {
        List<ContentItem> items = List.of(
                new ContentItem("article", "https://zhihu.com/p/1", 1673740800L, 100, 20, 10, "Java 入门", "学习 Java 基础"),
                new ContentItem("article", "https://zhihu.com/p/2", 1673827200L, 200, 30, 20, "Spring Boot", "Spring Boot 实战"),
                new ContentItem("answer", "https://zhihu.com/answer/3", 1677628800L, 50, 5, 3, "如何学编程", "从零开始")
        );

        AnalyzeResponse response = service.buildAnalyzeResponse(items);

        assertEquals(3, response.total());
        assertEquals(350, response.totalLikes());
        assertEquals(55, response.totalComments());
        assertEquals(33, response.totalFavorites());
        assertEquals(1673740800L, response.firstCreated());
        assertEquals(1677628800L, response.lastCreated());

        // 类型分布
        assertEquals(2, response.byType().get("article"));
        assertEquals(1, response.byType().get("answer"));

        // Top 列表
        assertEquals(3, response.topLiked().size());
        assertEquals(200, response.topLiked().get(0).likeCount()); // 第一名应是 200 赞的
        assertEquals(3, response.topCommented().size());
        assertEquals(30, response.topCommented().get(0).commentCount());

        // 年度统计
        assertFalse(response.yearlyStats().isEmpty());
    }

    @Test
    void buildAnalyzeResponse_single_item() {
        List<ContentItem> items = List.of(
                new ContentItem("zvideo", "https://zhihu.com/v/1", 1700000000L, 500, 100, 50, "视频标题", "视频摘要")
        );

        AnalyzeResponse response = service.buildAnalyzeResponse(items);

        assertEquals(1, response.total());
        assertEquals(500, response.totalLikes());
        assertEquals(1700000000L, response.firstCreated());
        assertEquals(1700000000L, response.lastCreated());
        assertEquals(1, response.byType().get("zvideo"));
        assertEquals(1, response.yearlyStats().size());
        assertEquals(500, response.yearlyStats().get(0).likes());
    }

    @Test
    void generateWordCloud_extracts_words() {
        List<ContentItem> items = List.of(
                new ContentItem("article", "", 1673740800L, 0, 0, 0,
                        "Java 编程入门指南", "学习 Java 编程的基础知识和实战技巧"),
                new ContentItem("article", "", 1673827200L, 0, 0, 0,
                        "Python 数据分析", "使用 Python 进行数据分析和可视化")
        );

        List<WordCloudEntry> wordCloud = service.generateWordCloud(items);

        assertFalse(wordCloud.isEmpty(), "词云不应为空");
        // 验证停用词被过滤
        boolean hasStopWord = wordCloud.stream().anyMatch(w -> w.word().equals("的") || w.word().equals("和"));
        assertFalse(hasStopWord, "词云不应包含停用词");
        // 验证按频率排序
        for (int i = 1; i < wordCloud.size(); i++) {
            assertTrue(wordCloud.get(i - 1).count() >= wordCloud.get(i).count(),
                    "词云应按频率降序排列");
        }
    }

    @Test
    void generateWordCloud_filters_numbers_and_punctuation() {
        List<ContentItem> items = List.of(
                new ContentItem("article", "", 1673740800L, 0, 0, 0,
                        "2023年 3.14 的数学常数", "数学 --- ** 标点符号测试 数学")
        );

        List<WordCloudEntry> wordCloud = service.generateWordCloud(items);

        // 纯数字和标点不应出现
        boolean hasNumber = wordCloud.stream().anyMatch(w -> w.word().matches("-?\\d+(\\.\\d+)?"));
        assertFalse(hasNumber, "词云不应包含纯数字");
        boolean hasPunct = wordCloud.stream().anyMatch(w -> w.word().equals("---") || w.word().equals("**"));
        assertFalse(hasPunct, "词云不应包含标点符号");
    }

    @Test
    void generateWordCloud_empty_items_returns_empty() {
        List<WordCloudEntry> wordCloud = service.generateWordCloud(List.of());
        assertTrue(wordCloud.isEmpty());
    }

    @Test
    void generateWordCloud_limits_to_200_entries() {
        // 构造大量不同标题
        var items = new java.util.ArrayList<ContentItem>();
        for (int i = 0; i < 500; i++) {
            items.add(new ContentItem("article", "", 1673740800L, 0, 0, 0,
                    "独特词汇" + i + "号 技术分享第" + i + "期", "内容摘要" + i));
        }

        List<WordCloudEntry> wordCloud = service.generateWordCloud(items);
        assertTrue(wordCloud.size() <= 200, "词云应限制在 200 个词以内");
    }

    @Test
    void buildAnalyzeResponse_yearly_stats_sorted_by_year() {
        List<ContentItem> items = List.of(
                new ContentItem("article", "", 1700000000L, 10, 1, 1, "2023", ""), // 2023-11
                new ContentItem("article", "", 1609459200L, 20, 2, 2, "2021", ""), // 2021-01
                new ContentItem("article", "", 1656633600L, 30, 3, 3, "2022", "")  // 2022-07
        );

        AnalyzeResponse response = service.buildAnalyzeResponse(items);

        assertEquals(3, response.yearlyStats().size());
        assertEquals(2021, response.yearlyStats().get(0).year());
        assertEquals(2022, response.yearlyStats().get(1).year());
        assertEquals(2023, response.yearlyStats().get(2).year());
    }
}
