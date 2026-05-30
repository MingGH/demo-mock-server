package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringGlobalStats;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringQuestionStats;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringStatsResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.SocialEngineeringSubmitResponse;
import run.runnable.numfeelservice.model.SocialEngineeringRecord;
import run.runnable.numfeelservice.model.TrackingEntities.SocialEngineeringQuestion;
import run.runnable.numfeelservice.model.TrackingEntities.SocialEngineeringSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

/**
 * 社会工程学防骗挑战 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class SocialEngineeringService {

    private static final Logger log = LoggerFactory.getLogger(SocialEngineeringService.class);

    private final R2dbcEntityTemplate template;

    public SocialEngineeringService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    /** 提交一次完整问卷结果。 */
    public Mono<SocialEngineeringSubmitResponse> submit(SocialEngineeringRecord record) {
        long now = System.currentTimeMillis();
        boolean allCorrect = record.correct() == record.total();

        SocialEngineeringSession session = new SocialEngineeringSession(
                null, record.sessionId(), record.total(), record.correct(), allCorrect, now);
        Mono<SocialEngineeringSession> sessionMono = template.insert(SocialEngineeringSession.class).using(session);

        Mono<Void> questionsMono = Flux.fromIterable(record.questions())
                .map(q -> new SocialEngineeringQuestion(
                        null, record.sessionId(), q.questionId(), q.tactic(), q.isFake(), q.correct(), now))
                .concatMap(question -> template.insert(SocialEngineeringQuestion.class).using(question))
                .then();

        return sessionMono.then(questionsMono)
                .thenReturn(new SocialEngineeringSubmitResponse(true))
                .onErrorResume(err -> {
                    log.error("submit failed: {}", err.getMessage());
                    return Mono.error(err);
                });
    }

    /** 查询全局统计 + 每题统计。 */
    public Mono<SocialEngineeringStatsResponse> stats() {
        Mono<SocialEngineeringGlobalStats> globalMono = ServiceSupport.selectAll(template, SocialEngineeringSession.class)
                .map(this::toGlobalStats);

        Mono<List<SocialEngineeringQuestionStats>> questionMono = ServiceSupport.selectAll(template, SocialEngineeringQuestion.class)
                .map(this::toQuestionStats);

        return Mono.zip(globalMono, questionMono)
                .map(tuple -> new SocialEngineeringStatsResponse(tuple.getT1(), tuple.getT2()));
    }

    /** 汇总整场测试的参与人数、全对人数与平均得分。 */
    private SocialEngineeringGlobalStats toGlobalStats(List<SocialEngineeringSession> rows) {
        return new SocialEngineeringGlobalStats(
                rows.size(),
                rows.stream().filter(SocialEngineeringSession::allCorrect).count(),
                rows.stream().mapToInt(SocialEngineeringSession::correct).sum(),
                rows.stream().mapToInt(row -> row.total() - row.correct()).sum(),
                rows.isEmpty() ? 0.0 : round1(rows.stream()
                        .mapToDouble(row -> row.correct() * 100.0 / row.total())
                        .average()
                        .orElse(0))
        );
    }

    /** 按题号与手法分组，构建前端答对率面板所需的单题统计。 */
    private List<SocialEngineeringQuestionStats> toQuestionStats(List<SocialEngineeringQuestion> rows) {
        List<SocialEngineeringQuestionStats> questions = new ArrayList<>();
        rows.stream()
                .collect(java.util.stream.Collectors.groupingBy(row -> row.questionId() + ":" + row.tactic()))
                .entrySet()
                .stream()
                .sorted(java.util.Comparator.comparingInt(entry -> Integer.parseInt(entry.getKey().split(":")[0])))
                .forEach(entry -> questions.add(toSingleQuestionStats(entry.getValue())));
        return questions;
    }

    /** 将同一题目的多条作答记录转换为单条聚合统计。 */
    private SocialEngineeringQuestionStats toSingleQuestionStats(List<SocialEngineeringQuestion> rows) {
        SocialEngineeringQuestion first = rows.get(0);
        long correctCount = rows.stream().filter(SocialEngineeringQuestion::correct).count();
        long wrongCount = rows.size() - correctCount;
        return new SocialEngineeringQuestionStats(
                first.questionId(),
                first.tactic(),
                rows.size(),
                correctCount,
                wrongCount,
                rows.isEmpty() ? 0.0 : round1(correctCount * 100.0 / rows.size())
        );
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }
}
