package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.TrackingRequests.CaptchaLevels;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.CaptchaSubmitRequest;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.CaptchaGlobalStats;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.CaptchaMetrics;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.CaptchaStatsResponse;
import run.runnable.numfeelservice.controller.dto.TrackingResponses.CaptchaSubmitResponse;
import run.runnable.numfeelservice.model.TrackingEntities.CaptchaResult;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * CAPTCHA 攻防实验室 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class CaptchaStatsService {

    private final R2dbcEntityTemplate template;

    public CaptchaStatsService(R2dbcEntityTemplate template) {
        this.template = template;
    }

    public Mono<CaptchaSubmitResponse> submit(CaptchaSubmitRequest request) {
        int passedCount = request.passedCount();
        int totalTimeMs = request.totalTimeMs();
        CaptchaResult entity = toEntity(request);

        return template.insert(CaptchaResult.class)
                .using(entity)
                .then(ServiceSupport.selectAll(template, CaptchaResult.class))
                .map(rows -> toSubmitResponse(rows, passedCount, totalTimeMs));
    }

    public Mono<CaptchaStatsResponse> stats() {
        return ServiceSupport.selectAll(template, CaptchaResult.class)
                .map(this::toStatsResponse);
    }

    /** 将前端一次挑战结果转换为数据库实体。 */
    private CaptchaResult toEntity(CaptchaSubmitRequest request) {
        CaptchaLevels levels = request.levels();
        return new CaptchaResult(
                null,
                request.passedCount(),
                request.totalTimeMs(),
                request.grade(),
                intVal(levels == null ? null : levels.text()),
                intVal(levels == null ? null : levels.math()),
                intVal(levels == null ? null : levels.slider()),
                intVal(levels == null ? null : levels.grid()),
                intVal(levels == null ? null : levels.click()),
                intVal(levels == null ? null : levels.rotate()),
                intVal(levels == null ? null : levels.spatial()),
                intVal(levels == null ? null : levels.behavior()),
                intVal(levels == null ? null : levels.timeText()),
                intVal(levels == null ? null : levels.timeMath()),
                intVal(levels == null ? null : levels.timeSlider()),
                intVal(levels == null ? null : levels.timeGrid()),
                intVal(levels == null ? null : levels.timeClick()),
                intVal(levels == null ? null : levels.timeRotate()),
                intVal(levels == null ? null : levels.timeSpatial()),
                intVal(levels == null ? null : levels.timeBehavior()),
                System.currentTimeMillis()
        );
    }

    /** 根据当前成绩在所有历史样本中的相对位置生成排名反馈。 */
    private CaptchaSubmitResponse toSubmitResponse(java.util.List<CaptchaResult> rows, int passedCount, int totalTimeMs) {
        long rank = rows.stream()
                .filter(row -> row.passedCount() > passedCount
                        || (row.passedCount() == passedCount && row.totalTimeMs() < totalTimeMs))
                .count() + 1;
        long totalSessions = rows.size();
        double percentile = totalSessions > 0
                ? Math.round((1.0 - (double) rank / totalSessions) * 100)
                : 50;
        return new CaptchaSubmitResponse(rank, totalSessions, percentile);
    }

    /** 计算验证码全局统计，包括关卡通过率、平均耗时和评级分布。 */
    private CaptchaStatsResponse toStatsResponse(java.util.List<CaptchaResult> rows) {
        CaptchaMetrics passRates = new CaptchaMetrics(
                avgPct(rows.stream().mapToInt(CaptchaResult::lvText).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvMath).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvSlider).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvGrid).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvClick).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvRotate).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvSpatial).average().orElse(0)),
                avgPct(rows.stream().mapToInt(CaptchaResult::lvBehavior).average().orElse(0))
        );
        CaptchaMetrics avgTimes = new CaptchaMetrics(
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeText).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeMath).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeSlider).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeGrid).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeClick).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeRotate).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeSpatial).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::timeBehavior).average().orElse(0))
        );
        CaptchaGlobalStats global = new CaptchaGlobalStats(
                rows.size(),
                round2(rows.stream().mapToInt(CaptchaResult::passedCount).average().orElse(0)),
                avgSeconds(rows.stream().mapToInt(CaptchaResult::totalTimeMs).average().orElse(0)),
                passRates,
                avgTimes
        );
        Map<String, Long> gradeDist = new LinkedHashMap<>(ServiceSupport.countBy(rows, CaptchaResult::grade));
        return new CaptchaStatsResponse(global, gradeDist);
    }

    private int intVal(Integer value) {
        return value == null ? 0 : value;
    }

    private double round1(double value) {
        return ServiceSupport.round(value, 1);
    }

    private double round2(double value) {
        return ServiceSupport.round(value, 2);
    }

    private double avgPct(double ratioValue) {
        return round1(ratioValue * 100);
    }

    private double avgSeconds(double milliseconds) {
        return round1(milliseconds / 1000.0);
    }
}
