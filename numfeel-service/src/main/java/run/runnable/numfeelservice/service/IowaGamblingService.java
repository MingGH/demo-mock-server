package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.IowaGamblingStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.IowaGamblingResult;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 爱荷华赌博任务 — 业务逻辑层。
 * 负责持久化完整牌局结果，并聚合全站统计供结果页与论文数据对比。
 */
@Service
public class IowaGamblingService {

    private static final Logger log = LoggerFactory.getLogger(IowaGamblingService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final R2dbcEntityTemplate template;

    public IowaGamblingService(R2dbcEntityTemplate template) {
        this.template = template;
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
}
