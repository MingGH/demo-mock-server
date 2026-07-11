package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.BrainComputeLeader;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.BrainComputeSubmitResponse;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.BrainComputeTopResponse;
import run.runnable.numfeelservice.model.GameplayEntities.BrainComputeEntry;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 人脑算力排行榜 — 业务逻辑层。
 * <p>
 * 提交前先做 Cloudflare Turnstile 人机验证，拦住脚本刷榜；
 * 综合分由后端按 {@link #computeScore} 权威计算，忽略前端自报分数。
 * 评分口径与前端 {@code logic.js} 的 computeScore 保持一致，避免预览与最终结果不符。
 */
@Service
public class BrainComputeService {

    // 与前端 logic.js SCORE_BOUNDS 对齐：越接近 best 越接近满分，达到 worst 记 0 分
    static final int REACTION_BEST = 150;
    static final int REACTION_WORST = 450;
    static final int CAT_BEST = 400;
    static final int CAT_WORST = 3000;

    private final R2dbcEntityTemplate template;
    private final TurnstileVerifier turnstileVerifier;

    public BrainComputeService(R2dbcEntityTemplate template, TurnstileVerifier turnstileVerifier) {
        this.template = template;
        this.turnstileVerifier = turnstileVerifier;
    }

    /**
     * 提交一次成绩：先人机验证，再由后端算分入库，返回名次反馈。
     *
     * @param name       玩家昵称（已在控制器层清洗）
     * @param reactionMs 平均反应延迟（毫秒）
     * @param catMs      找猫耗时（毫秒）
     * @param ballScore  接球预判得分（0-100）
     * @param token      Turnstile token
     * @param remoteIp   客户真实 IP
     * @return 含综合分、评级、名次的提交响应
     */
    public Mono<BrainComputeSubmitResponse> submit(String name, int reactionMs, int catMs,
                                                   int ballScore, String token, String remoteIp) {
        int score = computeScore(reactionMs, catMs, ballScore);
        String grade = gradeOf(score);
        BrainComputeEntry entity = new BrainComputeEntry(
                null, name, score, reactionMs, catMs, ballScore, grade, System.currentTimeMillis());
        // 人机验证通过前不触碰数据库：用 defer 保证 insert/select 只在 verify 成功后才构建执行
        return turnstileVerifier.verify(token, remoteIp)
                .then(Mono.defer(() -> template.insert(BrainComputeEntry.class).using(entity)))
                .then(Mono.defer(() -> ServiceSupport.selectAll(template, BrainComputeEntry.class)))
                .map(rows -> new BrainComputeSubmitResponse(
                        name, score, grade, rankByScore(rows, score), rows.size()));
    }

    /** 查询排行榜前 N 名，按综合分优先、提交时间次序排序。 */
    public Mono<BrainComputeTopResponse> top(int limit) {
        int safeLimit = ServiceSupport.clampLimit(limit, 1, 50);
        return ServiceSupport.selectAll(template, BrainComputeEntry.class)
                .map(rows -> toTopResponse(rows, safeLimit));
    }

    /** 清空排行榜记录，供管理接口或测试场景使用。 */
    public Mono<Void> clear() {
        return template.delete(BrainComputeEntry.class).all().then();
    }

    /**
     * 综合评分：反应 + 找猫 + 接球，每项 0-100，合计 0-300 的整数。
     * 与前端 logic.js computeScore 同口径。
     */
    protected int computeScore(int reactionMs, int catMs, int ballScore) {
        double r = timeComponent(reactionMs, REACTION_BEST, REACTION_WORST);
        double c = timeComponent(catMs, CAT_BEST, CAT_WORST);
        double b = clamp01(ballScore / 100.0) * 100.0;
        return (int) Math.round(r + c + b);
    }

    /** 依据综合分（0-300）给出评级，与前端 gradeOf 一致。 */
    protected String gradeOf(int score) {
        if (score >= 260) return "神经反射级";
        if (score >= 200) return "身手不凡";
        if (score >= 140) return "训练有素";
        if (score >= 80) return "普通人类";
        return "还需练习";
    }

    /** 把「越小越好」的耗时映射到 0-100 分。 */
    private static double timeComponent(int ms, int best, int worst) {
        return clamp01((double) (worst - ms) / (worst - best)) * 100.0;
    }

    private static double clamp01(double x) {
        if (x < 0) return 0;
        if (x > 1) return 1;
        return x;
    }

    /** 按综合分计算当前成绩名次，高分在前。 */
    private long rankByScore(List<BrainComputeEntry> rows, int score) {
        return rows.stream().filter(row -> row.score() > score).count() + 1;
    }

    /** 构建前端排行榜列表，附带总样本数。 */
    private BrainComputeTopResponse toTopResponse(List<BrainComputeEntry> rows, int limit) {
        List<BrainComputeEntry> sortedRows = ServiceSupport.sorted(
                rows,
                Comparator.comparingInt(BrainComputeEntry::score).reversed()
                        .thenComparingLong(BrainComputeEntry::createdAt)
        );
        List<BrainComputeLeader> leaders = new ArrayList<>();
        int rank = 1;
        for (BrainComputeEntry row : sortedRows.stream().limit(limit).toList()) {
            leaders.add(new BrainComputeLeader(
                    rank++,
                    row.name(),
                    row.score(),
                    row.reactionMs(),
                    row.catMs(),
                    row.ballScore(),
                    row.grade()
            ));
        }
        return new BrainComputeTopResponse(leaders, rows.size());
    }
}
