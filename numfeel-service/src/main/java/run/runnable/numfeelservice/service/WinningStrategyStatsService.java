package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.WinningStrategyStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.WinningStrategyStat;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * 必胜策略游戏对局统计 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class WinningStrategyStatsService {

    private final R2dbcEntityTemplate template;

    public WinningStrategyStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次必胜策略游戏对局结果，并返回最新的全局统计。
     *
     * @param game       博弈模式（bash、wythoff 或 coin）
     * @param result     对局结果（win 或 lose）
     * @param difficulty 难度级别
     * @param rounds     对局回合数
     * @return 更新后的全局统计响应
     */
    public Mono<WinningStrategyStatsResponse> submit(String game, String result, String difficulty, int rounds) {
        WinningStrategyStat entity = new WinningStrategyStat(
                null, game, result, difficulty, rounds, System.currentTimeMillis());
        return template.insert(WinningStrategyStat.class).using(entity).then(getStats());
    }

    /**
     * 查询必胜策略游戏全局统计数据，包括总胜率、模式分布以及 AI 在不同模式/难度下的胜场数据。
     *
     * @return 包含全局指标与模式分布的统计响应
     */
    public Mono<WinningStrategyStatsResponse> getStats() {
        return ServiceSupport.selectAll(template, WinningStrategyStat.class)
                .map(this::toStatsResponse);
    }

    /** 聚合总胜率、模式分布以及 AI 在不同模式/难度下的胜场数据。 */
    private WinningStrategyStatsResponse toStatsResponse(java.util.List<WinningStrategyStat> rows) {
        long total = rows.size();
        long playerWins = rows.stream().filter(row -> "win".equals(row.result())).count();
        long aiWins = rows.stream().filter(row -> "lose".equals(row.result())).count();

        return new WinningStrategyStatsResponse(
                total,
                playerWins,
                aiWins,
                round1(total > 0 ? aiWins * 100.0 / total : 0),
                countByGame(rows, "bash"),
                countByGame(rows, "wythoff"),
                countByGame(rows, "coin"),
                rows.stream().filter(row -> "lose".equals(row.result()) && "hard".equals(row.difficulty())).count(),
                rows.stream().filter(row -> "lose".equals(row.result()) && "bash".equals(row.game())).count(),
                rows.stream().filter(row -> "lose".equals(row.result()) && "wythoff".equals(row.game())).count(),
                rows.stream().filter(row -> "lose".equals(row.result()) && "coin".equals(row.game())).count()
        );
    }

    /** 统计某个博弈模式的总对局数。 */
    private long countByGame(java.util.List<WinningStrategyStat> rows, String game) {
        return rows.stream().filter(row -> game.equals(row.game())).count();
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
