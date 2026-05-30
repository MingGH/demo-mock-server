package run.runnable.numfeelservice.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * 追踪、采集与排行榜相关接口使用的响应 DTO。
 */
public final class TrackingResponses {

    private TrackingResponses() {
    }

    /**
     * 浏览器指纹采集接口响应。
     *
     * @param total 数据源中的累计采集总数
     * @param sameHashCount 与当前总指纹完全相同的历史记录数
     * @param lastSeenAt 同一指纹上一次出现的时间戳；首次出现时为空
     * @param source 当前响应的数据来源，例如 `mysql` 或 `memory`
     */
    public record BrowserFingerprintCollectResponse(
            long total,
            Long sameHashCount,
            Long lastSeenAt,
            String source
    ) {
    }

    /**
     * 浏览器指纹全站统计响应。
     *
     * @param total 累计采集到的总记录数
     * @param uniqueFull 总指纹哈希去重后的唯一设备数
     * @param avgVisits 平均每个唯一指纹出现的次数
     * @param uniqueCanvas Canvas 指纹去重后的唯一数
     * @param uniqueFont 字体指纹去重后的唯一数
     * @param uniqueWebgl WebGL 指纹去重后的唯一数
     * @param uniqueTimezone 时区维度去重后的唯一数
     * @param uniqueScreen 屏幕信息维度去重后的唯一数
     * @param uniquePlatform 平台维度去重后的唯一数
     * @param avgEntropy 已上报样本的平均熵值
     */
    public record BrowserFingerprintStatsResponse(
            long total,
            long uniqueFull,
            double avgVisits,
            long uniqueCanvas,
            long uniqueFont,
            long uniqueWebgl,
            long uniqueTimezone,
            long uniqueScreen,
            long uniquePlatform,
            double avgEntropy
    ) {
    }

    /**
     * 验证码挑战提交后的个人排名结果。
     *
     * @param rank 当前结果在全部样本中的排名
     * @param totalSessions 当前累计样本数
     * @param percentile 超过的用户百分位
     */
    public record CaptchaSubmitResponse(
            long rank,
            long totalSessions,
            double percentile
    ) {
    }

    /**
     * 验证码八个子关卡的统计指标。
     *
     * @param text 扭曲文字关的统计值
     * @param math 数学运算关的统计值
     * @param slider 滑块拼图关的统计值
     * @param grid 九宫格选择关的统计值
     * @param click 文字点选关的统计值
     * @param rotate 旋转对齐关的统计值
     * @param spatial 空间推理关的统计值
     * @param behavior 行为验证关的统计值
     */
    public record CaptchaMetrics(
            double text,
            double math,
            double slider,
            double grid,
            double click,
            double rotate,
            double spatial,
            double behavior
    ) {
    }

    /**
     * 验证码挑战全局统计。
     *
     * @param totalSessions 累计挑战次数
     * @param avgPassed 平均通过关卡数
     * @param avgTotalSec 平均总耗时，单位秒
     * @param passRates 各关卡平均通过率
     * @param avgTimes 各关卡平均耗时
     */
    public record CaptchaGlobalStats(
            long totalSessions,
            double avgPassed,
            double avgTotalSec,
            CaptchaMetrics passRates,
            CaptchaMetrics avgTimes
    ) {
    }

    /**
     * 验证码挑战统计接口响应。
     *
     * @param global 全局统计汇总
     * @param gradeDist 各评级的分布情况
     */
    public record CaptchaStatsResponse(
            CaptchaGlobalStats global,
            Map<String, Long> gradeDist
    ) {
    }

    /**
     * 社会工程学测试提交结果。
     *
     * @param ok 是否保存成功
     */
    public record SocialEngineeringSubmitResponse(boolean ok) {
    }

    /**
     * 社会工程学测试全局统计。
     *
     * @param totalSessions 累计参与会话数
     * @param perfectSessions 全部答对的会话数
     * @param totalCorrectAnswers 所有会话累计答对题数
     * @param totalWrongAnswers 所有会话累计答错题数
     * @param avgScorePct 平均得分百分比
     */
    public record SocialEngineeringGlobalStats(
            long totalSessions,
            long perfectSessions,
            int totalCorrectAnswers,
            int totalWrongAnswers,
            double avgScorePct
    ) {
    }

    /**
     * 社会工程学测试单题统计。
     *
     * @param questionId 题目编号
     * @param tactic 题目对应的社工手法标识
     * @param attempts 该题累计作答次数
     * @param correctCount 该题累计答对次数
     * @param wrongCount 该题累计答错次数
     * @param correctRate 该题答对率
     */
    public record SocialEngineeringQuestionStats(
            int questionId,
            String tactic,
            int attempts,
            long correctCount,
            long wrongCount,
            double correctRate
    ) {
    }

    /**
     * 社会工程学测试统计接口响应。
     *
     * @param global 全局统计
     * @param questions 每题答对率统计
     */
    public record SocialEngineeringStatsResponse(
            SocialEngineeringGlobalStats global,
            List<SocialEngineeringQuestionStats> questions
    ) {
    }

    /**
     * 记忆力排行榜单轮历史记录。
     *
     * @param n 该轮容量值
     * @param accuracy 该轮正确率
     */
    public record MemoryHistoryItemResponse(
            int n,
            double accuracy
    ) {
    }

    /**
     * 记忆力排行榜单条记录。
     *
     * @param id 记录唯一标识
     * @param name 玩家昵称
     * @param capacity 达到的最高容量
     * @param cacheKB 前端估算的缓存大小，单位 KB
     * @param avgAccuracy 历史平均正确率
     * @param history 每一轮成绩明细
     * @param createdAt 提交时间戳
     * @param rank 当前排名；列表查询可能为空
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MemoryLeaderboardEntryResponse(
            String id,
            String name,
            int capacity,
            double cacheKB,
            double avgAccuracy,
            List<MemoryHistoryItemResponse> history,
            long createdAt,
            Integer rank
    ) {
    }

    /**
     * 记忆力排行榜查询响应。
     *
     * @param total 返回的总条目数
     * @param leaders 排行榜列表
     */
    public record MemoryLeaderboardListResponse(
            int total,
            List<MemoryLeaderboardEntryResponse> leaders
    ) {
    }
}
