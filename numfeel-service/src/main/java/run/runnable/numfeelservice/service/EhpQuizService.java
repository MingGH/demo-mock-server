package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.EhpQuizStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.EhpQuizResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * EHP 词条对比直觉测试 — 业务逻辑层。
 */
@Service
public class EhpQuizService {

    private final R2dbcEntityTemplate template;

    public EhpQuizService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /**
     * 提交一次测试结果。
     */
    public Mono<EhpQuizStatsResponse> submit(int totalQuestions, int correctCount,
                                              boolean q1, boolean q2, boolean q3, boolean q4, boolean q5) {
        EhpQuizResult entity = new EhpQuizResult(
                null, totalQuestions, correctCount, q1, q2, q3, q4, q5, System.currentTimeMillis());
        return template.insert(EhpQuizResult.class)
                .using(entity)
                .then(stats());
    }

    /**
     * 查询统计数据。
     */
    public Mono<EhpQuizStatsResponse> stats() {
        return ServiceSupport.selectAll(template, EhpQuizResult.class)
                .map(this::buildStats);
    }

    private EhpQuizStatsResponse buildStats(List<EhpQuizResult> rows) {
        if (rows.isEmpty()) {
            return new EhpQuizStatsResponse(0, 0, 0, 0, 0, 0, 0, 0);
        }
        long total = rows.size();
        double avgCorrect = ServiceSupport.round(
                rows.stream().mapToInt(EhpQuizResult::correctCount).average().orElse(0), 1);
        long allCorrect = rows.stream().filter(r -> r.correctCount() == r.totalQuestions()).count();
        long q1c = rows.stream().filter(EhpQuizResult::q1Correct).count();
        long q2c = rows.stream().filter(EhpQuizResult::q2Correct).count();
        long q3c = rows.stream().filter(EhpQuizResult::q3Correct).count();
        long q4c = rows.stream().filter(EhpQuizResult::q4Correct).count();
        long q5c = rows.stream().filter(EhpQuizResult::q5Correct).count();

        return new EhpQuizStatsResponse(
                total,
                avgCorrect,
                ServiceSupport.percentage(allCorrect, total, 1),
                ServiceSupport.percentage(q1c, total, 1),
                ServiceSupport.percentage(q2c, total, 1),
                ServiceSupport.percentage(q3c, total, 1),
                ServiceSupport.percentage(q4c, total, 1),
                ServiceSupport.percentage(q5c, total, 1)
        );
    }
}
