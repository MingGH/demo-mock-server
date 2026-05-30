package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.NimGameStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.NimGameStat;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * 尼姆游戏对局统计 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class NimGameStatsService {

    private final R2dbcEntityTemplate template;

    public NimGameStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次尼姆游戏对局结果，并返回最新的全局统计。
     *
     * @param result     对局结果（win 或 lose）
     * @param difficulty 难度级别（easy、normal 或 hard）
     * @param rounds     对局回合数
     * @param preset     预设配置
     * @return 更新后的全局统计响应
     */
    public Mono<NimGameStatsResponse> submit(String result, String difficulty, int rounds, String preset) {
        NimGameStat entity = new NimGameStat(null, result, difficulty, rounds, preset, System.currentTimeMillis());
        return template.insert(NimGameStat.class).using(entity).then(getStats());
    }

    /**
     * 查询尼姆游戏全局统计数据，包括玩家胜率、AI 胜率和不同难度下的对局分布。
     *
     * @return 包含全局指标与难度分布的统计响应
     */
    public Mono<NimGameStatsResponse> getStats() {
        return ServiceSupport.selectAll(template, NimGameStat.class)
                .map(this::toStatsResponse);
    }

    /** 聚合玩家胜率、AI 胜率以及不同难度的对局分布。 */
    private NimGameStatsResponse toStatsResponse(java.util.List<NimGameStat> rows) {
        long total = rows.size();
        long playerWins = rows.stream().filter(row -> "win".equals(row.result())).count();
        long aiWins = rows.stream().filter(row -> "lose".equals(row.result())).count();
        long aiWinsHard = rows.stream()
                .filter(row -> "lose".equals(row.result()) && "hard".equals(row.difficulty()))
                .count();
        long playerWinsHard = rows.stream()
                .filter(row -> "win".equals(row.result()) && "hard".equals(row.difficulty()))
                .count();

        return new NimGameStatsResponse(
                total,
                playerWins,
                aiWins,
                round1(total > 0 ? aiWins * 100.0 / total : 0),
                round1((aiWinsHard + playerWinsHard) > 0 ? aiWinsHard * 100.0 / (aiWinsHard + playerWinsHard) : 0),
                countByDifficulty(rows, "easy"),
                countByDifficulty(rows, "normal"),
                countByDifficulty(rows, "hard")
        );
    }

    /** 统计某个难度档位下的对局数量。 */
    private long countByDifficulty(java.util.List<NimGameStat> rows, String difficulty) {
        return rows.stream().filter(row -> difficulty.equals(row.difficulty())).count();
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
