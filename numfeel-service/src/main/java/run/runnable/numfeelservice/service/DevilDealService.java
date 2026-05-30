package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.DevilDealGlobalStats;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.DevilDealStatsResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.DevilDealSubmitResponse;
import run.runnable.numfeelservice.model.GameplayEntities.DevilDealResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 恶魔交易诊断 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class DevilDealService {

    private static final Set<String> VALID_TYPES = Set.of(
            "power", "love", "money", "revenge", "recognition", "knowledge");

    private final R2dbcEntityTemplate template;

    public DevilDealService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public boolean isValidType(String type) {
        return type != null && VALID_TYPES.contains(type);
    }

    public boolean isValidPct(Integer pct) {
        return pct != null && pct >= 0 && pct <= 100;
    }

    /** 保存一次欲望占比分配结果，并返回首选交易类型的历史占比。 */
    public Mono<DevilDealSubmitResponse> submit(String dealType, String secondType,
                                                int powerPct, int lovePct, int moneyPct,
                                                int revengePct, int recognitionPct, int knowledgePct) {
        DevilDealResult entity = new DevilDealResult(
                null, dealType, secondType, powerPct, lovePct, moneyPct, revengePct,
                recognitionPct, knowledgePct, System.currentTimeMillis());
        return template.insert(DevilDealResult.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, DevilDealResult.class))
                .map(rows -> toSubmitResponse(rows, dealType));
    }

    public Mono<DevilDealStatsResponse> stats() {
        return ServiceSupport.selectAll(template, DevilDealResult.class)
                .map(this::toStatsResponse);
    }

    /** 统计当前首选交易类型在全部样本中的人数与占比。 */
    private DevilDealSubmitResponse toSubmitResponse(java.util.List<DevilDealResult> rows, String dealType) {
        long sameCount = rows.stream().filter(row -> dealType.equals(row.dealType())).count();
        long total = rows.size();
        double samePercent = total > 0 ? ServiceSupport.percentage(sameCount, total, 1) : 0;
        return new DevilDealSubmitResponse(sameCount, total, samePercent);
    }

    /** 聚合六种欲望占比均值与首选交易类型分布。 */
    private DevilDealStatsResponse toStatsResponse(java.util.List<DevilDealResult> rows) {
        DevilDealGlobalStats global = new DevilDealGlobalStats(
                rows.size(),
                round1(rows.stream().mapToInt(DevilDealResult::powerPct).average().orElse(0)),
                round1(rows.stream().mapToInt(DevilDealResult::lovePct).average().orElse(0)),
                round1(rows.stream().mapToInt(DevilDealResult::moneyPct).average().orElse(0)),
                round1(rows.stream().mapToInt(DevilDealResult::revengePct).average().orElse(0)),
                round1(rows.stream().mapToInt(DevilDealResult::recognitionPct).average().orElse(0)),
                round1(rows.stream().mapToInt(DevilDealResult::knowledgePct).average().orElse(0))
        );
        Map<String, Long> typeDist = new LinkedHashMap<>(ServiceSupport.countBy(rows, DevilDealResult::dealType));
        return new DevilDealStatsResponse(global, typeDist);
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
