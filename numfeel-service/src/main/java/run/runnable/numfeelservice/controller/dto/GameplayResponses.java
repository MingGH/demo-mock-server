package run.runnable.numfeelservice.controller.dto;

import java.util.List;
import java.util.Map;

/**
 * 游戏与实验类接口使用的响应 DTO。
 */
public final class GameplayResponses {

    private GameplayResponses() {
    }

    /**
     * 巴纳姆效应测试统计响应。
     *
     * @param tarotAvg 塔罗组平均认同分
     * @param randomAvg 随机组平均认同分
     * @param tarotCount 塔罗组样本数
     * @param randomCount 随机组样本数
     * @param diff 两组平均分差值
     * @param diffPercent 差值相对随机组的百分比
     * @param tarotDistribution 塔罗组 1-5 分分布
     * @param randomDistribution 随机组 1-5 分分布
     */
    public record BarnumStatsResponse(
            double tarotAvg,
            double randomAvg,
            long tarotCount,
            long randomCount,
            double diff,
            int diffPercent,
            List<Integer> tarotDistribution,
            List<Integer> randomDistribution
    ) {
    }

    /** @param totalRuns 累计实验次数 @param yourScore 本次实验得分 */
    public record CascadeFailureSubmitResponse(
            long totalRuns,
            int yourScore
    ) {
    }

    /** @param totalRuns 总实验数 @param avgSurvival 平均存活率 @param avgSteps 平均级联步数 @param avgScore 平均得分 @param highSurvivalRate 高存活率样本占比 */
    public record CascadeFailureGlobalStats(
            long totalRuns,
            double avgSurvival,
            double avgSteps,
            double avgScore,
            double highSurvivalRate
    ) {
    }

    /** @param topology 拓扑类型 @param count 该拓扑样本数 @param avgSurvival 该拓扑平均存活率 */
    public record CascadeFailureTopologyStats(
            String topology,
            int count,
            double avgSurvival
    ) {
    }

    /** @param global 全局统计 @param byTopology 按拓扑分组的统计 */
    public record CascadeFailureStatsResponse(
            CascadeFailureGlobalStats global,
            List<CascadeFailureTopologyStats> byTopology
    ) {
    }

    /** @param topology 拓扑类型 @param strategy 策略名 @param survivalRate 存活率 @param cascadeSteps 级联步数 @param score 得分 @param time 提交时间 @param rank 排名 */
    public record CascadeFailureLeaderboardEntry(
            String topology,
            String strategy,
            double survivalRate,
            int cascadeSteps,
            int score,
            long time,
            int rank
    ) {
    }

    /** @param leaders 排行榜列表 @param total 总样本数 */
    public record CascadeFailureLeaderboardResponse(
            List<CascadeFailureLeaderboardEntry> leaders,
            long total
    ) {
    }

    /** @param totalRuns 总局数 @param escapeRate 逃脱率 @param avgScore 平均得分 @param avgTurns 平均回合数 @param topStrategy 最常见策略 */
    public record CosmicReaperStatsResponse(
            long totalRuns,
            double escapeRate,
            double avgScore,
            double avgTurns,
            String topStrategy
    ) {
    }

    /** @param sameCount 与当前首选交易类型相同的历史样本数 @param total 总样本数 @param samePercent 同类占比 */
    public record DevilDealSubmitResponse(
            long sameCount,
            long total,
            double samePercent
    ) {
    }

    /** @param totalSessions 总提交数 @param avgPower 平均权力占比 @param avgLove 平均爱情占比 @param avgMoney 平均金钱占比 @param avgRevenge 平均复仇占比 @param avgRecognition 平均认可占比 @param avgKnowledge 平均知识占比 */
    public record DevilDealGlobalStats(
            long totalSessions,
            double avgPower,
            double avgLove,
            double avgMoney,
            double avgRevenge,
            double avgRecognition,
            double avgKnowledge
    ) {
    }

    /** @param global 全局统计 @param typeDist 首选交易类型分布 */
    public record DevilDealStatsResponse(
            DevilDealGlobalStats global,
            Map<String, Long> typeDist
    ) {
    }

    /** @param rank 当前绕路系数排名 @param total 总样本数 @param percentile 超过的用户百分位 */
    public record InceptionMazeSubmitResponse(
            long rank,
            long total,
            int percentile
    ) {
    }

    /** @param totalSessions 总样本数 @param avgDetour 平均绕路系数 @param maxDetour 最大绕路系数 @param avgPath 平均路径长度 @param avgWalls 平均墙体数量 @param levelDist 梦境层级分布 */
    public record InceptionMazeStatsResponse(
            long totalSessions,
            double avgDetour,
            double maxDetour,
            double avgPath,
            double avgWalls,
            Map<String, Long> levelDist
    ) {
    }

    /** @param name 玩家名 @param score 得分 @param rounds 回合数 @param wins 获胜回合数 @param grade 评级 @param rank 排名 */
    public record InferenceLeaderboardSubmitResponse(
            String name,
            int score,
            int rounds,
            int wins,
            String grade,
            long rank
    ) {
    }

    /** @param name 玩家名 @param score 得分 @param rounds 回合数 @param wins 获胜回合数 @param grade 评级 @param rank 排名 */
    public record InferenceLeaderboardLeader(
            String name,
            int score,
            int rounds,
            int wins,
            String grade,
            int rank
    ) {
    }

    /** @param leaders 排行榜列表 @param total 总样本数 */
    public record InferenceLeaderboardTopResponse(
            List<InferenceLeaderboardLeader> leaders,
            long total
    ) {
    }

    /** @param targetText 成功生成的目标文本 @param targetLength 目标长度 @param totalAttempts 尝试次数 @param success 是否成功 */
    public record MonkeyLeaderboardEntry(
            String targetText,
            int targetLength,
            long totalAttempts,
            boolean success
    ) {
    }

    /** @param totalRuns 总实验数 @param totalSuccesses 成功次数 @param successRate 成功率 @param longestTarget 成功样本中最长目标文本 @param leaderboard 成功排行榜 */
    public record MonkeyStatsResponse(
            long totalRuns,
            long totalSuccesses,
            double successRate,
            String longestTarget,
            List<MonkeyLeaderboardEntry> leaderboard
    ) {
    }

    /** @param totalRuns 总实验数 @param totalSuccesses 成功次数 @param successRate 成功率 @param longestTarget 成功样本中最长目标文本 */
    public record MonkeySubmitResponse(
            long totalRuns,
            long totalSuccesses,
            double successRate,
            String longestTarget
    ) {
    }

    /** @param total 总样本数 @param oneBox 单盒人数 @param twoBox 双盒人数 @param hits 预测命中次数 @param hitRate 命中率 @param oneBoxPct 单盒占比 @param twoBoxPct 双盒占比 @param avgOnePayoff 单盒平均收益 @param avgTwoPayoff 双盒平均收益 */
    public record NewcombStatsResponse(
            long total,
            long oneBox,
            long twoBox,
            long hits,
            double hitRate,
            double oneBoxPct,
            double twoBoxPct,
            long avgOnePayoff,
            long avgTwoPayoff
    ) {
    }

    /** @param total 总对局数 @param playerWins 玩家胜场 @param aiWins AI 胜场 @param aiWinRate AI 总胜率 @param aiWinRateHard AI 在 hard 难度下胜率 @param gamesEasy easy 场次 @param gamesNormal normal 场次 @param gamesHard hard 场次 */
    public record NimGameStatsResponse(
            long total,
            long playerWins,
            long aiWins,
            double aiWinRate,
            double aiWinRateHard,
            long gamesEasy,
            long gamesNormal,
            long gamesHard
    ) {
    }

    /** @param participants 参与人数 @param stock 库存数 @param count 该场景样本数 @param wins 抢到次数 @param winRate 抢到率 */
    public record SecKillScenarioStats(
            int participants,
            int stock,
            int count,
            long wins,
            double winRate
    ) {
    }

    /** @param totalRuns 总实验数 @param totalWins 抢到次数 @param winRate 总抢到率 @param byScenario 按场景聚合统计 */
    public record SecKillStatsResponse(
            long totalRuns,
            long totalWins,
            double winRate,
            List<SecKillScenarioStats> byScenario
    ) {
    }

    /** @param totalRuns 总实验数 @param totalWins 抢到次数 @param winRate 总抢到率 */
    public record SecKillSubmitResponse(
            long totalRuns,
            long totalWins,
            double winRate
    ) {
    }

    /** @param label 分桶区间标签 @param count 区间内样本数 */
    public record SoritesBucket(
            String label,
            int count
    ) {
    }

    /** @param totalCount 总样本数 @param sandMean 沙堆边界平均值 @param baldMean 秃头边界平均值 @param colorMean 颜色边界平均值 @param sandMedian 沙堆边界中位数 @param baldMedian 秃头边界中位数 @param colorMedian 颜色边界中位数 @param sandDistribution 沙堆边界分布 @param baldDistribution 秃头边界分布 @param colorDistribution 颜色边界分布 */
    public record SoritesStatsResponse(
            long totalCount,
            long sandMean,
            long baldMean,
            long colorMean,
            int sandMedian,
            int baldMedian,
            int colorMedian,
            List<SoritesBucket> sandDistribution,
            List<SoritesBucket> baldDistribution,
            List<SoritesBucket> colorDistribution
    ) {
    }

    /** @param rank 当前效应值排名 @param totalSessions 总样本数 @param percentile 超过的用户百分位 */
    public record StroopSubmitResponse(
            long rank,
            long totalSessions,
            double percentile
    ) {
    }

    /** @param totalSessions 总样本数 @param avgStroopEffect 平均 Stroop 效应值 @param avgRT 平均反应时 @param avgAccuracyPct 平均正确率百分比 @param minStroopEffect 最小效应值 @param maxStroopEffect 最大效应值 @param avgConRT 一致条件平均反应时 @param avgIncRT 不一致条件平均反应时 */
    public record StroopGlobalStats(
            long totalSessions,
            double avgStroopEffect,
            double avgRT,
            double avgAccuracyPct,
            double minStroopEffect,
            double maxStroopEffect,
            double avgConRT,
            double avgIncRT
    ) {
    }

    /** @param global 全局统计 @param gradeDist 评级分布 */
    public record StroopStatsResponse(
            StroopGlobalStats global,
            Map<String, Long> gradeDist
    ) {
    }

    /** @param rank 当前总分排名 @param totalSessions 总样本数 */
    public record TimePerceptionSubmitResponse(
            long rank,
            long totalSessions
    ) {
    }

    /** @param totalSessions 总样本数 @param avgScore 平均分 @param avgAbsDistortion 平均绝对偏差 @param avgWeber 平均韦伯分数 @param avgBlankDist 空白等待平均偏差 @param avgLoadDist 认知负荷平均偏差 @param avgEmotionDist 情绪唤醒平均偏差 @param overRatio 高估型占比 @param underRatio 低估型占比 */
    public record TimePerceptionGlobalStats(
            long totalSessions,
            double avgScore,
            double avgAbsDistortion,
            double avgWeber,
            double avgBlankDist,
            double avgLoadDist,
            double avgEmotionDist,
            double overRatio,
            double underRatio
    ) {
    }

    /** @param global 全局统计 @param gradeDist 评级分布 */
    public record TimePerceptionStatsResponse(
            TimePerceptionGlobalStats global,
            Map<String, Long> gradeDist
    ) {
    }

    /** @param rank 排名 @param name 玩家名 @param score 得分 @param grade 评级 @param weber 韦伯分数 */
    public record TimePerceptionLeaderboardEntry(
            int rank,
            String name,
            int score,
            String grade,
            double weber
    ) {
    }

    /** @param leaders 排行榜列表 @param total 总样本数 */
    public record TimePerceptionLeaderboardResponse(
            List<TimePerceptionLeaderboardEntry> leaders,
            long total
    ) {
    }

    /** @param total 总对局数 @param playerWins 玩家胜场 @param aiWins AI 胜场 @param aiWinRate AI 胜率 @param gamesBash Bash 场次 @param gamesWythoff Wythoff 场次 @param gamesCoin Coin 场次 @param aiWinsHard hard 难度 AI 胜场 @param aiWinsBash Bash 模式 AI 胜场 @param aiWinsWythoff Wythoff 模式 AI 胜场 @param aiWinsCoin Coin 模式 AI 胜场 */
    public record WinningStrategyStatsResponse(
            long total,
            long playerWins,
            long aiWins,
            double aiWinRate,
            long gamesBash,
            long gamesWythoff,
            long gamesCoin,
            long aiWinsHard,
            long aiWinsBash,
            long aiWinsWythoff,
            long aiWinsCoin
    ) {
    }

    /**
     * 康威生命游戏图案统计响应。
     *
     * @param total 总提交数
     * @param patternCounts 各图案类型的提交次数分布
     */
    public record GameOfLifePatternStatsResponse(
            long total,
            java.util.Map<String, Long> patternCounts
    ) {
    }

    /**
     * EHP词条对比直觉测试统计响应。
     *
     * @param totalSessions 总参与人数
     * @param avgCorrect 平均答对数
     * @param allCorrectRate 全对率
     * @param q1CorrectRate 第1题正确率
     * @param q2CorrectRate 第2题正确率
     * @param q3CorrectRate 第3题正确率
     * @param q4CorrectRate 第4题正确率
     * @param q5CorrectRate 第5题正确率
     */
    public record EhpQuizStatsResponse(
            long totalSessions,
            double avgCorrect,
            double allCorrectRate,
            double q1CorrectRate,
            double q2CorrectRate,
            double q3CorrectRate,
            double q4CorrectRate,
            double q5CorrectRate
    ) {
    }
}
