package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.ConjunctionFallacyStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.ConjunctionFallacyResult;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
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
    private final DatabaseClient db;

    public ConjunctionFallacyService(R2dbcEntityTemplate template, DatabaseClient db) {
        this.template = template;
        this.db = db;
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
     * 聚合走 DatabaseClient 原生 SQL，不 selectAll 全表物化。
     *
     * @return 聚合统计响应
     */
    public Mono<ConjunctionFallacyStatsResponse> stats() {
        return db.sql(STATS_SQL)
                .map((row, meta) -> buildStats(row))
                .one()
                .defaultIfEmpty(new ConjunctionFallacyStatsResponse(0, 0, 0, 0, List.of()));
    }

    // ── 聚合 SQL ────────────────────────────────────────────────

    private static final String STATS_SQL = """
            SELECT
                COUNT(*) AS total_sessions,
                COALESCE(AVG(correct_count), 0) AS avg_correct,
                COALESCE(SUM(CASE WHEN correct_count = 10 THEN 1 ELSE 0 END), 0) AS all_correct,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[0]') = 1 THEN 1 ELSE 0 END), 0) AS q0_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[0]') = 0 THEN 1 ELSE 0 END), 0) AS q0_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[1]') = 1 THEN 1 ELSE 0 END), 0) AS q1_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[1]') = 0 THEN 1 ELSE 0 END), 0) AS q1_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[2]') = 1 THEN 1 ELSE 0 END), 0) AS q2_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[2]') = 0 THEN 1 ELSE 0 END), 0) AS q2_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[3]') = 1 THEN 1 ELSE 0 END), 0) AS q3_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[3]') = 0 THEN 1 ELSE 0 END), 0) AS q3_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[4]') = 1 THEN 1 ELSE 0 END), 0) AS q4_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[4]') = 0 THEN 1 ELSE 0 END), 0) AS q4_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[5]') = 1 THEN 1 ELSE 0 END), 0) AS q5_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[5]') = 0 THEN 1 ELSE 0 END), 0) AS q5_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[6]') = 1 THEN 1 ELSE 0 END), 0) AS q6_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[6]') = 0 THEN 1 ELSE 0 END), 0) AS q6_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[7]') = 1 THEN 1 ELSE 0 END), 0) AS q7_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[7]') = 0 THEN 1 ELSE 0 END), 0) AS q7_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[8]') = 1 THEN 1 ELSE 0 END), 0) AS q8_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[8]') = 0 THEN 1 ELSE 0 END), 0) AS q8_single,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[9]') = 1 THEN 1 ELSE 0 END), 0) AS q9_conj,
                COALESCE(SUM(CASE WHEN JSON_EXTRACT(answers, '$[9]') = 0 THEN 1 ELSE 0 END), 0) AS q9_single
            FROM conjunction_fallacy_results
            """;

    // ── 聚合逻辑 ────────────────────────────────────────────────

    /**
     * 从 SQL 聚合结果行构造统计响应（可独立单元测试）。
     */
    static ConjunctionFallacyStatsResponse buildStats(io.r2dbc.spi.Row row) {
        long total = number(row.get("total_sessions")).longValue();
        if (total == 0) {
            return new ConjunctionFallacyStatsResponse(0, 0, 0, 0, List.of());
        }
        double avgCorrect = ServiceSupport.round(number(row.get("avg_correct")).doubleValue(), 1);
        long allCorrect = number(row.get("all_correct")).longValue();

        List<ConjunctionFallacyQuestionRate> perQuestion = new ArrayList<>();
        long totalConjunction = 0;
        for (int q = 0; q < QUESTION_COUNT; q++) {
            long conjunction = number(row.get("q" + q + "_conj")).longValue();
            long single = number(row.get("q" + q + "_single")).longValue();
            long answered = single + conjunction;
            totalConjunction += conjunction;
            double conjunctionRate = ServiceSupport.percentage(conjunction, answered, 1);
            double correctRate = ServiceSupport.percentage(single, answered, 1);
            perQuestion.add(new ConjunctionFallacyQuestionRate(
                    q + 1, answered, single, conjunction, conjunctionRate, correctRate));
        }

        return new ConjunctionFallacyStatsResponse(
                total,
                avgCorrect,
                ServiceSupport.percentage(allCorrect, total, 1),
                ServiceSupport.percentage(totalConjunction, (long) QUESTION_COUNT * total, 1),
                perQuestion);
    }

    private static Number number(Object value) {
        return value instanceof Number n ? n : 0;
    }

    // ── 工具方法 ────────────────────────────────────────────────

    /**
     * 解析每题选择 JSON 数组；解析失败或长度不等于 QUESTION_COUNT 时返回空列表（该记录跳过统计）。
     */
    static List<Integer> parseAnswers(String json) {
        try {
            List<Integer> list = new ArrayList<>();
            var node = MAPPER.readTree(json);
            if (node != null && node.isArray()) {
                if (node.size() != QUESTION_COUNT) {
                    log.warn("conjunction-fallacy parse answers: expected {} elements, got {}",
                            QUESTION_COUNT, node.size());
                    return List.of();
                }
                node.forEach(n -> list.add(n.asInt()));
            }
            return list;
        } catch (Exception e) {
            log.warn("conjunction-fallacy parse answers failed: {}", e.getMessage());
            return List.of();
        }
    }
}