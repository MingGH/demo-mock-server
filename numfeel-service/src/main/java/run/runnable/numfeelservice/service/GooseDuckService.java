package run.runnable.numfeelservice.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.GooseDuckQuestionRate;
import run.runnable.numfeelservice.controller.dto.GameplayResponses.GooseDuckStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.GooseDuckResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 鹅腿 vs 鸭腿测评 — 业务逻辑层。
 * <p>
 * 记录每位用户的作答结果，提供全局统计。
 */
@Service
public class GooseDuckService {

    private static final Logger log = LoggerFactory.getLogger(GooseDuckService.class);
    private static final int TOTAL_QUESTIONS = 10;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final R2dbcEntityTemplate template;

    public GooseDuckService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /** 提交一次测评结果。 */
    public Mono<Void> submit(int correctCount, int total, String answersJson) {
        GooseDuckResult entity = new GooseDuckResult(
                null,
                correctCount,
                total,
                answersJson,
                System.currentTimeMillis()
        );
        return template.insert(GooseDuckResult.class).using(entity).then();
    }

    /** 查询全局统计。 */
    public Mono<GooseDuckStatsResponse> stats() {
        return ServiceSupport.selectAll(template, GooseDuckResult.class)
                .map(this::toStatsResponse);
    }

    private GooseDuckStatsResponse toStatsResponse(List<GooseDuckResult> rows) {
        if (rows.isEmpty()) {
            return new GooseDuckStatsResponse(0, 0, 0, List.of());
        }

        long totalPlayers = rows.size();
        double avgScore = rows.stream().mapToInt(GooseDuckResult::correctCount).average().orElse(0);
        double avgAccuracy = avgScore / TOTAL_QUESTIONS;

        // 计算每题正确率
        int[] questionCorrect = new int[TOTAL_QUESTIONS];
        int[] questionTotal = new int[TOTAL_QUESTIONS];

        for (GooseDuckResult row : rows) {
            try {
                JsonNode answers = MAPPER.readTree(row.answers());
                if (answers != null && answers.isArray()) {
                    for (JsonNode ans : answers) {
                        int qId = ans.get("questionId").asInt() - 1;
                        if (qId >= 0 && qId < TOTAL_QUESTIONS) {
                            questionTotal[qId]++;
                            if (ans.get("correct").asBoolean()) {
                                questionCorrect[qId]++;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("Failed to parse answers JSON for row {}", row.id(), e);
            }
        }

        List<GooseDuckQuestionRate> perQuestion = new ArrayList<>(TOTAL_QUESTIONS);
        for (int i = 0; i < TOTAL_QUESTIONS; i++) {
            double rate = questionTotal[i] > 0 ? (double) questionCorrect[i] / questionTotal[i] : 0;
            perQuestion.add(new GooseDuckQuestionRate(i + 1, ServiceSupport.round(rate, 3)));
        }

        return new GooseDuckStatsResponse(
                totalPlayers,
                ServiceSupport.round(avgScore, 1),
                ServiceSupport.round(avgAccuracy, 3),
                perQuestion
        );
    }
}
