package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.KeystrokeStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.KeystrokeProfile;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 键盘输入节奏识别 — 业务逻辑层。
 * 持久化打字样本，聚合全站统计，并计算指定 session 的"指纹独特性"（最近邻居距离）。
 * <p>
 * 聚合统计（COUNT / AVG(total_ms)）走 DatabaseClient 原生 SQL，不做全表物化；
 * 最近邻居距离是逐样本特征比对（向量相似度），无法用 SQL 表达，保留在内存完成。
 * 整体结果通过 {@link Cacheable} 缓存 60 秒，避免每次请求全量重算。
 */
@Service
public class KeystrokeService {

    private static final Logger log = LoggerFactory.getLogger(KeystrokeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 最近邻居计算需要的最小列投影。 */
    private static final String PROJECTION_SQL =
            "SELECT session_id, hold_times, intervals FROM keystroke_profiles";
    /** 全站聚合：样本总数 + 平均整句耗时。 */
    private static final String AGG_SQL =
            "SELECT COUNT(*) AS total, COALESCE(AVG(total_ms), 0) AS avg_total FROM keystroke_profiles";

    private final R2dbcEntityTemplate template;
    private final DatabaseClient db;

    public KeystrokeService(R2dbcEntityTemplate template, DatabaseClient db) {
        this.template = template;
        this.db = db;
    }

    /**
     * 提交一次打字样本。
     *
     * @param sessionId   客户端会话 ID
     * @param sampleIndex 第几次样本（0/1）
     * @param textHash    打字文本标识
     * @param holdTimes   每键按压时长 JSON 数组字符串
     * @param intervals   键间间隔 JSON 数组字符串
     * @param totalMs     整句总耗时 ms
     * @param errorCount  打错字符数
     * @return 完成信号
     */
    public Mono<Void> submit(String sessionId, int sampleIndex, String textHash,
                             String holdTimes, String intervals, int totalMs, int errorCount) {
        KeystrokeProfile entity = new KeystrokeProfile(
                null, sessionId, sampleIndex, textHash, holdTimes, intervals,
                totalMs, errorCount, System.currentTimeMillis());
        return template.insert(KeystrokeProfile.class).using(entity).then();
    }

    /**
     * 查询全站统计 + 指定 session 的指纹独特性。
     * 最近邻居距离：该 session 的所有样本，与全站其他 session 样本的最小特征距离。
     *
     * @param sessionId 客户端会话 ID（用于计算独特性；null 时跳过）
     * @return 聚合统计响应
     */
    @Cacheable(cacheNames = "keystrokeStats", sync = true)
    public Mono<KeystrokeStatsResponse> stats(String sessionId) {
        Mono<List<KeystrokeProfile>> rowsMono = db.sql(PROJECTION_SQL)
                .map((row, metadata) -> new KeystrokeProfile(
                        null,
                        (String) row.get("session_id"),
                        0,
                        null,
                        (String) row.get("hold_times"),
                        (String) row.get("intervals"),
                        0, 0, 0))
                .all()
                .collectList();
        Mono<long[]> aggMono = db.sql(AGG_SQL)
                .map((row, metadata) -> new long[]{
                        number(row.get("total")).longValue(),
                        Math.round(number(row.get("avg_total")).doubleValue())})
                .one()
                .defaultIfEmpty(new long[]{0, 0});
        return Mono.zip(rowsMono, aggMono)
                .map(t -> aggregateStats(t.getT1(), t.getT2()[0], t.getT2()[1], sessionId));
    }

    /**
     * 由全站样本行聚合出统计响应（可独立单元测试的纯逻辑）。
     *
     * @param rows      全站样本（仅需 session_id / hold_times / intervals）
     * @param total     SQL 聚合出的样本总数
     * @param avgTotal  SQL 聚合出的平均整句耗时 ms
     * @param sessionId 当前会话 ID
     * @return 聚合统计响应
     */
    static KeystrokeStatsResponse aggregateStats(List<KeystrokeProfile> rows,
                                                 long total, double avgTotal, String sessionId) {
        double avgHold = ServiceSupport.round(
                rows.stream().flatMap(r -> parseList(r.holdTimes()).stream())
                        .mapToInt(Integer::intValue).average().orElse(0), 1);
        double avgInterval = ServiceSupport.round(
                rows.stream().flatMap(r -> parseList(r.intervals()).stream())
                        .mapToInt(Integer::intValue).average().orElse(0), 1);

        long myCount = 0;
        double nearest = -1;
        if (sessionId != null && !sessionId.isBlank()) {
            List<KeystrokeProfile> mine = rows.stream()
                    .filter(r -> sessionId.equals(r.sessionId()))
                    .collect(Collectors.toList());
            myCount = mine.size();
            nearest = computeNearestDistance(mine, rows);
        }
        return new KeystrokeStatsResponse(total, avgTotal, avgHold, avgInterval, nearest, myCount);
    }

    /**
     * 计算自己样本与全站其他 session 样本的最小特征距离。
     *
     * @param mine 该 session 的样本
     * @param all  全站样本（含自己，会排除同 session）
     * @return 最小距离；无法计算（自己或他人样本不足）时返回 -1
     */
    private static double computeNearestDistance(List<KeystrokeProfile> mine, List<KeystrokeProfile> all) {
        if (mine.isEmpty()) {
            return -1;
        }
        List<KeystrokeProfile> others = all.stream()
                .filter(r -> !mine.get(0).sessionId().equals(r.sessionId()))
                .collect(Collectors.toList());
        if (others.isEmpty()) {
            return -1;
        }
        double min = Double.MAX_VALUE;
        for (KeystrokeProfile m : mine) {
            List<Integer> mh = parseList(m.holdTimes());
            List<Integer> mi = parseList(m.intervals());
            if (mh.isEmpty() || mi.isEmpty()) {
                continue;
            }
            for (KeystrokeProfile o : others) {
                List<Integer> oh = parseList(o.holdTimes());
                List<Integer> oi = parseList(o.intervals());
                if (oh.isEmpty() || oi.isEmpty()) {
                    continue;
                }
                double d = weightedDistance(mh, mi, oh, oi);
                if (d < min) {
                    min = d;
                }
            }
        }
        return min == Double.MAX_VALUE ? -1 : min;
    }

    /**
     * 加权欧氏距离：与前端 engine.computeDistance 同一口径——
     * hold 差值除以 200ms、interval 差值除以 500ms 归一化，hold 权重 0.6 / interval 权重 0.4，
     * 两段特征分别截断到较短长度，结果保留 1 位小数。
     *
     * @return 归一化距离（0 = 完全一致；越大差异越大）；任一维为空时返回 Double.MAX_VALUE
     */
    private static double weightedDistance(List<Integer> h1, List<Integer> i1,
                                           List<Integer> h2, List<Integer> i2) {
        int nh = Math.min(h1.size(), h2.size());
        if (nh == 0) {
            return Double.MAX_VALUE;
        }
        double holdSum = 0;
        for (int k = 0; k < nh; k++) {
            double d = (h1.get(k) - h2.get(k)) / 200.0;
            holdSum += d * d;
        }
        int ni = Math.min(i1.size(), i2.size());
        double intSum = 0;
        for (int k = 0; k < ni; k++) {
            double d = (i1.get(k) - i2.get(k)) / 500.0;
            intSum += d * d;
        }
        double holdPart = Math.sqrt(holdSum / nh);
        double intPart = ni > 0 ? Math.sqrt(intSum / ni) : 0;
        return ServiceSupport.round(0.6 * holdPart + 0.4 * intPart, 1);
    }

    /**
     * 解析 JSON 数字数组字符串；失败时返回空列表。
     */
    static List<Integer> parseList(String json) {
        List<Integer> list = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return list;
        }
        try {
            var node = MAPPER.readTree(json);
            if (node != null && node.isArray()) {
                node.forEach(n -> list.add(n.asInt()));
            }
        } catch (Exception e) {
            log.warn("keystroke parse list failed: {}", e.getMessage());
        }
        return list;
    }

    private static Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
