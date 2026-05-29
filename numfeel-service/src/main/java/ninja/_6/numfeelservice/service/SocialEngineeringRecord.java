package ninja._6.numfeelservice.service;

import java.util.List;

/**
 * 一次问卷提交的数据模型（迁移自 Vert.x 版）。
 */
public record SocialEngineeringRecord(
        String sessionId,
        int total,
        int correct,
        List<QuestionResult> questions
) {
    public record QuestionResult(
            int questionId,
            String tactic,
            boolean isFake,
            boolean correct
    ) {
    }
}
