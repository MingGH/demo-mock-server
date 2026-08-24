package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.ConjunctionFallacyResult;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 合取谬误（Conjunction Fallacy）测试 — 业务逻辑层。
 * <p>
 * 记录 10 道"琳达式"题目的作答（每题 0=选单项 A，1=选合取项 B），
 * 聚合全站各题选择分布，用于与论文常模（约 85% 选中合取项）对照。
 */
@Service
public class ConjunctionFallacyService {

    private static final Logger log = LoggerFactory.getLogger(ConjunctionFallacyService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 题目总数（固定 10）。 */
    public static final int QUESTION_COUNT = 10;

    private final R2dbcEntityTemplate template;

    public ConjunctionFallacyService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次测试结果并返回最新的全局统计。
     *
     * @param sessionId     客户端生成的会话 ID
     * @param totalQuestions 题目总数（应等于 10）
     * @param correctCount   答对题数（选单项 A 即答对）
     * @param answers        每题选择 JSON 数组字符串，如 [0,1,0]
     * @return 提交后的全局统计
     */
    public Mono<ConjunctionFallacyStatsResponse> submit(String sessionId, int totalQuestions,
                                                        int correctCount, String answers) {
        ConjunctionFallacyResult entity = new ConjunctionFallacyResult(
                null, sessionId, totalQuestions, correctCount, answers, System.currentTimeMillis());
        return template.insert(ConjunctionFallacyResult.class)
                .using(entity)
                .then(stats());
    }

    /**
     * 查询全站统计：参与人数、平均答对数、全对率、平均合取项占比与每题分布。
     *
     * @return 聚合统计响应
     */
    public Mono<ConjunctionFallacyStatsResponse> stats() {
        return ServiceSupport.selectAll(template, ConjunctionFallacyResult.class)
                .map(this::buildStats);
    }

    private ConjunctionFallacyStatsResponse buildStats(List<ConjunctionFallacyResult> rows) {
        if (rows.isEmpty()) {
            return new ConjunctionFallacyStatsResponse(0, 0, 0, 0, List.of());
        }
        long total = rows.size();
        double avgCorrect = ServiceSupport.round(
                rows.stream().mapToInt(ConjunctionFallacyResult::correctCount).average().orElse(0), 1);
        long allCorrect = rows.stream().filter(r -> r.correctCount() >= QUESTION_COUNT).count();

        List<ConjunctionFallacyQuestionRate> perQuestion = new ArrayList<>();
        long totalConjunction = 0;
        for (int q = 0; q < QUESTION_COUNT; q++) {
            final int idx = q;
            long conjunction = rows.stream()
                    .map(r -> parseAnswers(r.answers()))
                    .filter(list -> list.size() > idx)
                    .filter(v -> v.get(idx) == 1)
                    .count();
            long single = rows.stream()
                    .map(r -> parseAnswers(r.answers()))
                    .filter(list -> list.size() > idx)
                    .filter(v -> v.get(idx) == 0)
                    .count();
            long answered = single + conjunction;
            totalConjunction += conjunction;
            double conjunctionRate = ServiceSupport.percentage(conjunction, answered, 1);
            double correctRate = ServiceSupport.percentage(single, answered, 1);
            perQuestion.add(new ConjunctionFallacyQuestionRate(
                    idx + 1, answered, single, conjunction, conjunctionRate, correctRate));
        }

        return new ConjunctionFallacyStatsResponse(
                total,
                avgCorrect,
                ServiceSupport.percentage(allCorrect, total, 1),
                ServiceSupport.percentage(totalConjunction, (long) QUESTION_COUNT * total, 1),
                perQuestion);
    }

    /**
     * 解析每题选择 JSON 数组；失败时返回空列表（该记录跳过统计）。
     */
    static List<Integer> parseAnswers(String json) {
        try {
            List<Integer> list = new ArrayList<>();
            var node = MAPPER.readTree(json);
            if (node != null && node.isArray()) {
                node.forEach(n -> list.add(n.asInt()));
            }
            return list;
        } catch (Exception e) {
            log.warn("conjunction-fallacy parse answers failed: {}", e.getMessage());
            return List.of();
        }
    }
}
