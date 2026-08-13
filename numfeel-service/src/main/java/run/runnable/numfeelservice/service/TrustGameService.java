package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.TrustGameStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.TrustGameResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 信任博弈 — 业务逻辑层。
 * 持久化玩家两阶段决策结果，聚合全站信任/互惠度统计。
 */
@Service
public class TrustGameService {

    private final R2dbcEntityTemplate template;

    public TrustGameService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次信任博弈结果。
     *
     * @param sessionId    客户端会话 ID
     * @param investAmount 投资额（0-10）
     * @param returnAmount 被委托人时返还额（0-30）
     * @param totalEarned  两阶段总收益
     * @param roleOrder    角色顺序 0=先投后返 1=先返后投
     * @return 完成信号
     */
    public Mono<Void> submit(String sessionId, int investAmount, int returnAmount,
                             int totalEarned, int roleOrder) {
        TrustGameResult entity = new TrustGameResult(
                null, sessionId, investAmount, returnAmount, totalEarned, roleOrder,
                System.currentTimeMillis());
        return template.insert(TrustGameResult.class).using(entity).then();
    }

    /**
     * 查询全站统计：记录数、平均投资额、平均返还额、投资额 0-10 分布。
     *
     * @return 聚合统计响应
     */
    public Mono<TrustGameStatsResponse> stats() {
        return ServiceSupport.selectAll(template, TrustGameResult.class)
                .map(rows -> {
                    if (rows.isEmpty()) {
                        return new TrustGameStatsResponse(0, 0, 0, List.of());
                    }
                    long total = rows.size();
                    double avgInvest = ServiceSupport.round(
                            rows.stream().mapToInt(TrustGameResult::investAmount).average().orElse(0), 1);
                    double avgReturn = ServiceSupport.round(
                            rows.stream().mapToInt(TrustGameResult::returnAmount).average().orElse(0), 1);

                    List<Long> dist = new ArrayList<>();
                    for (int i = 0; i <= 10; i++) {
                        final int v = i;
                        dist.add(rows.stream().filter(r -> r.investAmount() == v).count());
                    }
                    return new TrustGameStatsResponse(total, avgInvest, avgReturn, dist);
                });
    }
}
