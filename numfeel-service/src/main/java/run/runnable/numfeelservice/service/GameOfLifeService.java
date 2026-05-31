package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.GameOfLifePatternStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.GameOfLifePattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 康威生命游戏图案记录 — 业务逻辑层。
 */
@Service
public class GameOfLifeService {

    private static final Logger log = LoggerFactory.getLogger(GameOfLifeService.class);

    private final R2dbcEntityTemplate template;

    public GameOfLifeService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次生命游戏图案记录，并返回最新的全局统计。
     *
     * @param patternKey  图案类型标识，如 glider、blinker、random
     * @param gridData    网格数据的 JSON 序列化
     * @param gridCols    网格列数
     * @param gridRows    网格行数
     * @param description 可选描述
     * @return 更新后的全局统计响应
     */
    public Mono<GameOfLifePatternStatsResponse> submit(String patternKey, String gridData,
                                                        int gridCols, int gridRows,
                                                        String description) {
        GameOfLifePattern entity = new GameOfLifePattern(
                null, patternKey, gridData, gridCols, gridRows,
                description != null ? description : "", System.currentTimeMillis());
        return template.insert(GameOfLifePattern.class).using(entity).then(getStats());
    }

    /**
     * 查询生命游戏图案全局统计，通过聚合 SQL 避免读取 grid_data 大字段。
     *
     * @return 包含总提交数和各图案类型分布的统计响应
     */
    public Mono<GameOfLifePatternStatsResponse> getStats() {
        DatabaseClient client = template.getDatabaseClient();

        Mono<Long> totalMono = client.sql("SELECT COUNT(*) AS total FROM game_of_life_patterns")
                .map((row, meta) -> number(row.get("total")).longValue())
                .one()
                .defaultIfEmpty(0L);

        Mono<Map<String, Long>> countsMono = client.sql(
                        "SELECT pattern_key, COUNT(*) AS cnt FROM game_of_life_patterns GROUP BY pattern_key")
                .map((row, meta) -> Map.entry(
                        row.get("pattern_key") != null ? (String) row.get("pattern_key") : "unknown",
                        number(row.get("cnt")).longValue()))
                .all()
                .collectMap(Map.Entry::getKey, Map.Entry::getValue)
                .defaultIfEmpty(Map.of());

        return Mono.zip(totalMono, countsMono)
                .map(tuple -> new GameOfLifePatternStatsResponse(tuple.getT1(), tuple.getT2()))
                .doOnError(err -> log.error("game-of-life stats query failed: {}", err.getMessage()));
    }

    /**
     * 将可能为 {@code null} 或非数值类型的列值安全转为 {@link Number}。
     *
     * @param value 行数据中取出的列值
     * @return 值本身（如果是 Number 实例），否则返回 0
     */
    private Number number(Object value) {
        return value instanceof Number n ? n : 0;
    }
}
