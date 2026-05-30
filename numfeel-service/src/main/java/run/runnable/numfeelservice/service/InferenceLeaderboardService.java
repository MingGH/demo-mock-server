package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.InferenceLeaderboardLeader;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InferenceLeaderboardSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.InferenceLeaderboardTopResponse;
import run.runnable.numfeelservice.model.GameplayEntities.InferenceLeaderboardEntry;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;

/**
 * 统计侦探排行榜 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class InferenceLeaderboardService {

    private final R2dbcEntityTemplate template;

    public InferenceLeaderboardService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次统计侦探得分记录，并返回当前成绩的历史排名反馈。
     *
     * @param name   玩家名称
     * @param score  总得分
     * @param rounds 回合数
     * @param wins   获胜次数
     * @param grade  评级
     * @return 包含排名信息的提交响应
     */
    public Mono<InferenceLeaderboardSubmitResponse> submit(String name, int score, int rounds, int wins, String grade) {
        InferenceLeaderboardEntry entity = new InferenceLeaderboardEntry(
                null, name, score, rounds, wins, grade, System.currentTimeMillis());
        return template.insert(InferenceLeaderboardEntry.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, InferenceLeaderboardEntry.class))
                .map(rows -> new InferenceLeaderboardSubmitResponse(name, score, rounds, wins, grade, rankByScore(rows, score)));
    }

    /** 查询排行榜前 N 名，按得分优先、提交时间次序排序。 */
    public Mono<InferenceLeaderboardTopResponse> top(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 50);
        return ServiceSupport.selectAll(template, InferenceLeaderboardEntry.class)
                .map(rows -> toTopResponse(rows, safeLimit));
    }

    /** 清空排行榜记录，供管理接口或测试场景使用。 */
    public Mono<Void> clear() {
        return template.delete(InferenceLeaderboardEntry.class).all().then();
    }

    /** 按得分计算当前成绩名次，高分在前。 */
    private long rankByScore(List<InferenceLeaderboardEntry> rows, int score) {
        return rows.stream().filter(row -> row.score() > score).count() + 1;
    }

    /** 构建前端排行榜列表，附带总样本数。 */
    private InferenceLeaderboardTopResponse toTopResponse(List<InferenceLeaderboardEntry> rows, int limit) {
        List<InferenceLeaderboardEntry> sortedRows = ServiceSupport.sorted(
                rows,
                Comparator.comparingInt(InferenceLeaderboardEntry::score).reversed()
                        .thenComparingLong(InferenceLeaderboardEntry::createdAt)
        );
        List<InferenceLeaderboardLeader> leaders = new ArrayList<>();
        int rank = 1;
        for (InferenceLeaderboardEntry row : sortedRows.stream().limit(limit).toList()) {
            leaders.add(new InferenceLeaderboardLeader(
                    row.name(),
                    row.score(),
                    row.rounds(),
                    row.wins(),
                    row.grade(),
                    rank++
            ));
        }
        return new InferenceLeaderboardTopResponse(leaders, rows.size());
    }
}
