package com.example.demo_mock_server.service;

import java.util.List;

/**
 * 一次问卷提交的数据模型
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
    ) {}
}
