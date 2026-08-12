package run.runnable.numfeelservice.service;

import io.r2dbc.spi.Row;
import io.r2dbc.spi.RowMetadata;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardEntry;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingLeaderboardResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingResult;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;

/**
 * 爱荷华赌博任务 — 业务逻辑层。
 * 负责持久化完整牌局结果，并聚合全站统计供结果页与论文数据对比。
 */
@Service
public class IowaGamblingService {

    private static final Logger log = LoggerFactory.getLogger(IowaGamblingService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final R2dbcEntityTemplate template;
    private final DatabaseClient databaseClient;

    public IowaGamblingService(R2dbcEntityTemplate template, DatabaseClient databaseClient) {
        this.template = template;
        this.databaseClient = databaseClient;
    }

    /**
     * 提交一次完整的爱荷华赌博任务牌局结果。
     *
     * @param sessionId   客户端生成的会话 ID
     * @param totalRounds 实际完成手数（1~100）
     * @param finalMoney  结束时的资金
     * @param netScore    净分数 (C+D选数)-(A+B选数)
     * @param bankrupt    是否破产结束
     * @param deckPicks   四堆选牌次数 JSON 数组字符串
     * @param blockScores 每 20 手净分数 JSON 数组字符串
     * @return 完成信号
     */
    public Mono<Void> submit(String sessionId, int totalRounds, int finalMoney, int netScore,
                             boolean bankrupt, String deckPicks, String blockScores) {
        IowaGamblingResult entity = new IowaGamblingResult(
                null, sessionId, totalRounds, finalMoney, netScore,
                bankrupt, deckPicks, blockScores, System.currentTimeMillis());
        return template.insert(IowaGamblingResult.class).using(entity).then();
    }

    /**
     * 查询全站统计：总牌局数、平均净分数、平均最终资金、破产率、各堆平均选牌次数、每 20 手平均净分数。
     *
     * @return 聚合统计响应
     */
    public Mono<IowaGamblingStatsResponse> stats() {
        return ServiceSupport.selectAll(template, IowaGamblingResult.class)
                .map(rows -> {
                    if (rows.isEmpty()) {
                        return new IowaGamblingStatsResponse(0, 0, 0, 0, List.of(), List.of());
                    }
                    long total = rows.size();
                    double avgNet = ServiceSupport.round(
                            rows.stream().mapToInt(IowaGamblingResult::netScore).average().orElse(0), 1);
                    double avgMoney = ServiceSupport.round(
                            rows.stream().mapToInt(IowaGamblingResult::finalMoney).average().orElse(0), 1);
                    double bankruptRate = ServiceSupport.round(
                            rows.stream().filter(IowaGamblingResult::bankrupt).count() / (double) total, 2);

                    List<Double> avgPicks = averageDeckPicks(rows);
                    List<Double> avgBlocks = averageBlockScores(rows);
                    return new IowaGamblingStatsResponse(total, avgNet, avgMoney, bankruptRate, avgPicks, avgBlocks);
                });
    }

    private List<Double> averageDeckPicks(List<IowaGamblingResult> rows) {
        List<Double> avg = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            final int idx = i;
            double v = ServiceSupport.round(
                    rows.stream()
                            .map(r -> parseJsonArray(r.deckPicks(), 4))
                            .filter(l -> l.size() > idx)
                            .mapToInt(l -> l.get(idx))
                            .average().orElse(0), 1);
            avg.add(v);
        }
        return avg;
    }

    private List<Double> averageBlockScores(List<IowaGamblingResult> rows) {
        int maxLen = rows.stream()
                .mapToInt(r -> parseJsonArray(r.blockScores(), 0).size())
                .max().orElse(0);
        List<Double> avg = new ArrayList<>();
        for (int i = 0; i < maxLen; i++) {
            final int idx = i;
            double v = ServiceSupport.round(
                    rows.stream()
                            .map(r -> parseJsonArray(r.blockScores(), 0))
                            .filter(l -> l.size() > idx)
                            .mapToInt(l -> l.get(idx))
                            .average().orElse(0), 1);
            avg.add(v);
        }
        return avg;
    }

    /**
     * 解析 JSON 数字数组字符串；失败时返回指定长度的默认零数组。
     */
    static List<Integer> parseJsonArray(String json, int defaultLen) {
        try {
            List<Integer> list = new ArrayList<>();
            var node = MAPPER.readTree(json);
            if (node != null && node.isArray()) {
                node.forEach(n -> list.add(n.asInt()));
            }
            return list;
        } catch (Exception e) {
            log.warn("iowa-gambling parse json array failed: {}", e.getMessage());
            List<Integer> fallback = new ArrayList<>();
            for (int i = 0; i < defaultLen; i++) {
                fallback.add(0);
            }
            return fallback;
        }
    }

    /**
     * 查询净分数排行榜（按净分数降序，取前 10）。
     * <p>
     * 用原生 SQL 直接取 TOP N，避免全量加载后在内存中排序。
     *
     * @param limit 返回条数（1~50，超出自动收敛）
     * @return 排行榜响应，含榜单与总提交数
     */
    public Mono<IowaGamblingLeaderboardResponse> leaderboard(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 50);
        BiFunction<Row, RowMetadata, IowaGamblingLeaderboardEntry> mapper = (row, meta) ->
                new IowaGamblingLeaderboardEntry(
                        row.get("rank", Integer.class),
                        row.get("net_score", Integer.class),
                        row.get("final_money", Integer.class),
                        row.get("bankrupt", Boolean.class),
                        row.get("total_rounds", Integer.class),
                        row.get("created_at", Long.class)
                );
        Mono<List<IowaGamblingLeaderboardEntry>> leaders = databaseClient.sql(
                        "SELECT id, net_score, final_money, bankrupt, total_rounds, created_at, " +
                                "ROW_NUMBER() OVER (ORDER BY net_score DESC, final_money DESC, id ASC) AS rank " +
                                "FROM iowa_gambling_results ORDER BY net_score DESC, final_money DESC, id ASC LIMIT ?")
                .bind(0, safeLimit)
                .map(mapper)
                .all()
                .collectList();
        Mono<Long> total = databaseClient.sql("SELECT COUNT(*) AS cnt FROM iowa_gambling_results")
                .map((row, meta) -> row.get("cnt", Long.class))
                .one()
                .defaultIfEmpty(0L);
        return Mono.zip(leaders, total, IowaGamblingLeaderboardResponse::new);
    }
}
