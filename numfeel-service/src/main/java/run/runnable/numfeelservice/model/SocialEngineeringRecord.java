package run.runnable.numfeelservice.model;

import java.util.List;

/**
 * 社会工程学问卷一次提交的业务值对象。
 * <p>
 * 该类型用于封装 controller 组装后的完整问卷数据，
 * 供 service 进一步拆分并写入会话表与题目明细表。
 */
public record SocialEngineeringRecord(
        String sessionId,
        int total,
        int correct,
        List<QuestionResult> questions
) {
    /** 单题作答结果。 */
    public record QuestionResult(
            int questionId,
            String tactic,
            boolean isFake,
            boolean correct
    ) {
    }
}
