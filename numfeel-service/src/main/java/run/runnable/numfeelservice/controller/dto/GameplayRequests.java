package run.runnable.numfeelservice.controller.dto;

/**
 * 游戏与实验类接口使用的请求 DTO。
 */
public final class GameplayRequests {

    private GameplayRequests() {
    }

    /**
     * 巴纳姆效应测试提交参数。
     *
     * @param userGroup 用户被分配到的文案组别，如 `tarot` 或 `random`
     * @param rating1 第 1 条描述的认同评分
     * @param rating2 第 2 条描述的认同评分
     * @param rating3 第 3 条描述的认同评分
     * @param rating4 第 4 条描述的认同评分
     * @param rating5 第 5 条描述的认同评分
     */
    public record BarnumSubmitRequest(
            String userGroup,
            Integer rating1,
            Integer rating2,
            Integer rating3,
            Integer rating4,
            Integer rating5
    ) {
    }

    /**
     * 级联失效实验提交参数。
     *
     * @param topology 网络拓扑类型
     * @param coupling 节点耦合强度
     * @param capacity 节点容量上限
     * @param strategy 玩家采用的防护策略
     * @param triggerPos 初始触发点位置
     * @param survivalRate 故障后网络存活率
     * @param cascadeSteps 级联扩散步数
     * @param maxComponent 最大连通子图规模
     * @param totalNodes 网络总节点数
     * @param score 本局综合得分
     */
    public record CascadeFailureSubmitRequest(
            String topology,
            Integer coupling,
            Integer capacity,
            String strategy,
            String triggerPos,
            Double survivalRate,
            Integer cascadeSteps,
            Integer maxComponent,
            Integer totalNodes,
            Integer score
    ) {
    }

    /**
     * 宇宙死神策略测试提交参数。
     *
     * @param strategy 玩家选择的策略
     * @param escaped 是否成功逃脱
     * @param turns 本局总回合数
     * @param score 本局得分
     * @param finalTech 结束时科技值
     * @param finalSignal 结束时信号暴露值
     * @param finalStealth 结束时隐蔽值
     */
    public record CosmicReaperSubmitRequest(
            String strategy,
            Boolean escaped,
            Integer turns,
            Integer score,
            Integer finalTech,
            Integer finalSignal,
            Integer finalStealth
    ) {
    }

    /**
     * 恶魔交易测试提交参数。
     *
     * @param dealType 首选交换目标
     * @param secondType 次选交换目标
     * @param powerPct 对权力的欲望占比
     * @param lovePct 对爱情的欲望占比
     * @param moneyPct 对金钱的欲望占比
     * @param revengePct 对复仇的欲望占比
     * @param recognitionPct 对认可的欲望占比
     * @param knowledgePct 对知识的欲望占比
     */
    public record DevilDealSubmitRequest(
            String dealType,
            String secondType,
            Integer powerPct,
            Integer lovePct,
            Integer moneyPct,
            Integer revengePct,
            Integer recognitionPct,
            Integer knowledgePct
    ) {
    }

    /**
     * 筑梦迷宫测试提交参数。
     *
     * @param gridSize 迷宫边长
     * @param pathLength 玩家实际路径长度
     * @param minPath 理论最短路径长度
     * @param detourRatio 绕路系数
     * @param dreamLevel 当前梦境层数
     * @param wallCount 墙体数量
     */
    public record InceptionMazeSubmitRequest(
            Integer gridSize,
            Integer pathLength,
            Integer minPath,
            Double detourRatio,
            Integer dreamLevel,
            Integer wallCount
    ) {
    }

    /**
     * 推理排行榜成绩提交参数。
     *
     * @param name 玩家昵称
     * @param score 最终得分
     * @param rounds 总回合数
     * @param wins 答对回合数
     * @param grade 前端评级
     */
    public record InferenceLeaderboardSubmitRequest(
            String name,
            Integer score,
            Integer rounds,
            Integer wins,
            String grade
    ) {
    }

    /**
     * 无限猴子实验提交参数。
     *
     * @param targetText 目标文本
     * @param targetLength 目标文本长度
     * @param totalAttempts 尝试次数
     * @param totalChars 累计敲出的字符数
     * @param success 是否成功生成目标文本
     * @param timeElapsed 本次实验耗时
     */
    public record MonkeySubmitRequest(
            String targetText,
            Integer targetLength,
            Long totalAttempts,
            Long totalChars,
            Boolean success,
            Integer timeElapsed
    ) {
    }

    /**
     * Newcomb 悖论测试提交参数。
     *
     * @param choice 玩家选择单盒或双盒
     * @param prediction 预测机对玩家行为的预测
     * @param hit 预测是否命中
     * @param payoff 玩家最终收益
     */
    public record NewcombSubmitRequest(
            String choice,
            String prediction,
            Boolean hit,
            Integer payoff
    ) {
    }

    /**
     * Nim 博弈对局结果提交参数。
     *
     * @param result 对局结果，`win` 表示玩家获胜
     * @param difficulty AI 难度
     * @param rounds 对局回合数
     * @param preset 棋子初始配置标识
     */
    public record NimGameSubmitRequest(
            String result,
            String difficulty,
            Integer rounds,
            String preset
    ) {
    }

    /**
     * 秒杀实验统计提交参数。
     *
     * @param participants 参与抢购的人数
     * @param stock 库存数量
     * @param userWon 玩家是否抢到
     * @param userRank 玩家名次
     * @param userLatency 玩家请求延迟
     * @param latencyGap 与中签阈值的延迟差
     */
    public record SecKillSubmitRequest(
            Integer participants,
            Integer stock,
            Boolean userWon,
            Integer userRank,
            Double userLatency,
            Double latencyGap
    ) {
    }

    /**
     * 沙堆悖论测试提交参数。
     *
     * @param sandBoundary 认为“沙堆”成立的最小粒数
     * @param sandSharpness 对边界是否明确的主观判断
     * @param baldBoundary 认为“秃头”成立的临界发量
     * @param colorBoundary 认为颜色变化成立的临界值
     */
    public record SoritesSubmitRequest(
            Integer sandBoundary,
            String sandSharpness,
            Integer baldBoundary,
            Integer colorBoundary
    ) {
    }

    /**
     * Stroop 测试结果提交参数。
     *
     * @param total 总题数
     * @param correctCount 答对题数
     * @param accuracy 正确率
     * @param avgRT 平均反应时
     * @param conAvgRT 一致条件平均反应时
     * @param incAvgRT 不一致条件平均反应时
     * @param stroopEffect Stroop 效应值
     * @param grade 评级
     */
    public record StroopSubmitRequest(
            Integer total,
            Integer correctCount,
            Double accuracy,
            Double avgRT,
            Double conAvgRT,
            Double incAvgRT,
            Double stroopEffect,
            String grade
    ) {
    }

    /**
     * 时间知觉测试结果提交参数。
     *
     * @param name 玩家昵称
     * @param totalScore 总分
     * @param weberScore 韦伯分数
     * @param avgAbsDistortion 平均绝对偏差
     * @param blankAvgDistortion 空白等待阶段平均偏差
     * @param loadAvgDistortion 认知负荷阶段平均偏差
     * @param emotionAvgDistortion 情绪唤醒阶段平均偏差
     * @param biasDirection 高估/低估/平衡倾向
     * @param grade 评级文案
     */
    public record TimePerceptionSubmitRequest(
            String name,
            Integer totalScore,
            Double weberScore,
            Double avgAbsDistortion,
            Double blankAvgDistortion,
            Double loadAvgDistortion,
            Double emotionAvgDistortion,
            String biasDirection,
            String grade
    ) {
    }

    /**
     * 必胜策略小游戏结果提交参数。
     *
     * @param game 游戏类型，如 Bash、Wythoff 或 Coin
     * @param result 对局结果
     * @param difficulty AI 难度
     * @param rounds 对局回合数
     */
    public record WinningStrategySubmitRequest(
            String game,
            String result,
            String difficulty,
            Integer rounds
    ) {
    }

    /**
     * 康威生命游戏图案提交参数。
     *
     * @param patternKey 图案类型标识，如 glider、blinker、random
     * @param gridData 当前网格数据的 JSON 字符串（二维数组）
     * @param gridCols 网格列数
     * @param gridRows 网格行数
     * @param description 可选描述
     */
    public record GameOfLifeSubmitRequest(
            String patternKey,
            String gridData,
            Integer gridCols,
            Integer gridRows,
            String description
    ) {
    }

    /**
     * EHP词条对比直觉测试提交参数。
     *
     * @param totalQuestions 题目总数
     * @param correctCount 答对题数
     * @param q1Correct 第1题是否正确
     * @param q2Correct 第2题是否正确
     * @param q3Correct 第3题是否正确
     * @param q4Correct 第4题是否正确
     * @param q5Correct 第5题是否正确
     */
    public record EhpQuizSubmitRequest(
            Integer totalQuestions,
            Integer correctCount,
            Boolean q1Correct,
            Boolean q2Correct,
            Boolean q3Correct,
            Boolean q4Correct,
            Boolean q5Correct
    ) {
    }

    /**
     * 信息茧房模拟器实验提交参数。
     *
     * @param entropyDrop 信息熵下降百分比
     * @param dominantCat 主导内容类型
     * @param dominantPct 主导类型占比
     * @param convergeRound 收敛轮次（-1表示未收敛）
     * @param totalRounds 总轮次
     * @param clickSequence 点击序列JSON
     */
    public record FilterBubbleSubmitRequest(
            Double entropyDrop,
            String dominantCat,
            Double dominantPct,
            Integer convergeRound,
            Integer totalRounds,
            String clickSequence
    ) {
    }
}
