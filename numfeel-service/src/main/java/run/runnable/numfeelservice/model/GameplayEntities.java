package run.runnable.numfeelservice.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 游戏与实验类业务使用的 R2DBC 实体定义。
 * <p>
 * 这些实体按业务域集中放在一个文件中，供 service 通过
 * {@code R2dbcEntityTemplate} 进行表映射与读写。
 */
public final class GameplayEntities {

    private GameplayEntities() {
    }

    /** 巴纳姆效应测试结果表映射。 */
    @Table("barnum_results")
    public record BarnumResult(
            @Id Long id,
            @Column("user_group") String userGroup,
            @Column("rating_1") int rating1,
            @Column("rating_2") int rating2,
            @Column("rating_3") int rating3,
            @Column("rating_4") int rating4,
            @Column("rating_5") int rating5,
            @Column("avg_rating") double avgRating,
            @Column("created_at") long createdAt
    ) {
    }

    /** 级联失效实验结果表映射。 */
    @Table("cascade_failure_results")
    public record CascadeFailureResult(
            @Id Long id,
            String topology,
            int coupling,
            int capacity,
            String strategy,
            @Column("trigger_pos") String triggerPos,
            @Column("survival_rate") double survivalRate,
            @Column("cascade_steps") int cascadeSteps,
            @Column("max_component") int maxComponent,
            @Column("total_nodes") int totalNodes,
            int score,
            @Column("created_at") long createdAt
    ) {
    }

    /** 宇宙死神策略测试结果表映射。 */
    @Table("cosmic_reaper_results")
    public record CosmicReaperResult(
            @Id Long id,
            String strategy,
            @Column("escaped") boolean escaped,
            int turns,
            int score,
            @Column("final_tech") int finalTech,
            @Column("final_signal") int finalSignal,
            @Column("final_stealth") int finalStealth,
            @Column("created_at") long createdAt
    ) {
    }

    /** 恶魔交易测试结果表映射。 */
    @Table("devil_deal_results")
    public record DevilDealResult(
            @Id Long id,
            @Column("deal_type") String dealType,
            @Column("second_type") String secondType,
            @Column("power_pct") int powerPct,
            @Column("love_pct") int lovePct,
            @Column("money_pct") int moneyPct,
            @Column("revenge_pct") int revengePct,
            @Column("recognition_pct") int recognitionPct,
            @Column("knowledge_pct") int knowledgePct,
            @Column("created_at") long createdAt
    ) {
    }

    /** 筑梦迷宫测试结果表映射。 */
    @Table("inception_maze_results")
    public record InceptionMazeResult(
            @Id Long id,
            @Column("grid_size") int gridSize,
            @Column("path_length") int pathLength,
            @Column("min_path") int minPath,
            @Column("detour_ratio") double detourRatio,
            @Column("dream_level") int dreamLevel,
            @Column("wall_count") int wallCount,
            @Column("created_at") long createdAt
    ) {
    }

    /** 推理排行榜成绩表映射。 */
    @Table("inference_leaderboard")
    public record InferenceLeaderboardEntry(
            @Id Long id,
            String name,
            int score,
            int rounds,
            int wins,
            String grade,
            @Column("created_at") long createdAt
    ) {
    }

    /** 无限猴子实验统计表映射。 */
    @Table("monkey_stats")
    public record MonkeyStat(
            @Id Long id,
            @Column("target_text") String targetText,
            @Column("target_length") int targetLength,
            @Column("total_attempts") long totalAttempts,
            @Column("total_chars") long totalChars,
            boolean success,
            @Column("time_elapsed") int timeElapsed,
            @Column("created_at") long createdAt
    ) {
    }

    /** Newcomb 悖论测试结果表映射。 */
    @Table("newcomb_results")
    public record NewcombResult(
            @Id Long id,
            String choice,
            String prediction,
            boolean hit,
            int payoff,
            @Column("created_at") long createdAt
    ) {
    }

    /** Nim 博弈对局统计表映射。 */
    @Table("nim_game_stats")
    public record NimGameStat(
            @Id Long id,
            String result,
            String difficulty,
            int rounds,
            String preset,
            @Column("created_at") long createdAt
    ) {
    }

    /** 秒杀实验统计表映射。 */
    @Table("seckill_stats")
    public record SecKillStat(
            @Id Long id,
            int participants,
            int stock,
            @Column("user_won") boolean userWon,
            @Column("user_rank") int userRank,
            @Column("user_latency") double userLatency,
            @Column("latency_gap") double latencyGap,
            @Column("created_at") long createdAt
    ) {
    }

    /** 沙堆悖论测试结果表映射。 */
    @Table("sorites_results")
    public record SoritesResult(
            @Id Long id,
            @Column("sand_boundary") int sandBoundary,
            @Column("sand_sharpness") String sandSharpness,
            @Column("bald_boundary") int baldBoundary,
            @Column("color_boundary") int colorBoundary,
            @Column("created_at") long createdAt
    ) {
    }

    /** Stroop 测试结果表映射。 */
    @Table("stroop_results")
    public record StroopResult(
            @Id Long id,
            int total,
            @Column("correct_count") int correctCount,
            double accuracy,
            @Column("avg_rt") double avgRt,
            @Column("con_avg_rt") double conAvgRt,
            @Column("inc_avg_rt") double incAvgRt,
            @Column("stroop_effect") double stroopEffect,
            String grade,
            @Column("created_at") long createdAt
    ) {
    }

    /** 时间知觉测试结果表映射。 */
    @Table("time_perception_results")
    public record TimePerceptionResult(
            @Id Long id,
            @Column("player_name") String playerName,
            @Column("total_score") int totalScore,
            @Column("weber_score") double weberScore,
            @Column("avg_abs_distortion") double avgAbsDistortion,
            @Column("blank_avg_distortion") double blankAvgDistortion,
            @Column("load_avg_distortion") double loadAvgDistortion,
            @Column("emotion_avg_distortion") double emotionAvgDistortion,
            @Column("bias_direction") String biasDirection,
            String grade,
            @Column("created_at") long createdAt
    ) {
    }

    /** 必胜策略小游戏对局统计表映射。 */
    @Table("winning_strategy_stats")
    public record WinningStrategyStat(
            @Id Long id,
            String game,
            String result,
            String difficulty,
            int rounds,
            @Column("created_at") long createdAt
    ) {
    }

    /** 康威生命游戏图案提交记录表映射。 */
    @Table("game_of_life_patterns")
    public record GameOfLifePattern(
            @Id Long id,
            @Column("pattern_key") String patternKey,
            @Column("grid_data") String gridData,
            @Column("grid_cols") int gridCols,
            @Column("grid_rows") int gridRows,
            String description,
            @Column("created_at") long createdAt
    ) {
    }

    /** EHP词条对比直觉测试结果表映射。 */
    @Table("ehp_quiz_results")
    public record EhpQuizResult(
            @Id Long id,
            @Column("total_questions") int totalQuestions,
            @Column("correct_count") int correctCount,
            @Column("q1_correct") boolean q1Correct,
            @Column("q2_correct") boolean q2Correct,
            @Column("q3_correct") boolean q3Correct,
            @Column("q4_correct") boolean q4Correct,
            @Column("q5_correct") boolean q5Correct,
            @Column("created_at") long createdAt
    ) {
    }

    /** 信息茧房模拟器实验结果表映射。 */
    @Table("filter_bubble_results")
    public record FilterBubbleResult(
            @Id Long id,
            @Column("entropy_drop") double entropyDrop,
            @Column("dominant_cat") String dominantCat,
            @Column("dominant_pct") double dominantPct,
            @Column("converge_round") int convergeRound,
            @Column("total_rounds") int totalRounds,
            @Column("click_sequence") String clickSequence,
            @Column("created_at") long createdAt
    ) {
    }

    /** 鹅腿 vs 鸭腿测评结果表映射。 */
    @Table("goose_duck_results")
    public record GooseDuckResult(
            @Id Long id,
            @Column("correct_count") int correctCount,
            @Column("total") int total,
            @Column("answers") String answers,
            @Column("created_at") long createdAt
    ) {
    }

    /** 50%财富按钮 — 聚合统计表映射。 */
    @Table("wealth_button_stats")
    public record WealthButtonStats(
            @Id Integer id,
            long players,
            long bankrupt,
            long billionaire
    ) {
    }

    /** 50%财富按钮 — 排行榜表映射。 */
    @Table("wealth_button_leaderboard")
    public record WealthButtonLeaderboardEntry(
            @Id Long id,
            String username,
            @Column("final_wealth") double finalWealth,
            @Column("return_rate") double returnRate,
            @Column("press_count") int pressCount,
            @Column("win_count") int winCount,
            @Column("initial_wealth") int initialWealth,
            @Column("round_history") String roundHistory,
            @Column("pow_hash") String powHash,
            @Column("pow_nonce") String powNonce,
            @Column("created_at") long createdAt
    ) {
    }
}
