package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.KeystrokeStatsResponse;
import run.runnable.numfeelservice.model.GameplayEntities.KeystrokeProfile;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 键盘输入节奏识别 — 业务逻辑层。
 * 持久化打字样本，聚合全站统计，并计算指定 session 的"指纹独特性"（最近邻居距离）。
 */
@Service
public class KeystrokeService {

    private static final Logger log = LoggerFactory.getLogger(KeystrokeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final R2dbcEntityTemplate template;

    public KeystrokeService(R2dbcEntityTemplate template) {
        this.template = template;
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
    public Mono<KeystrokeStatsResponse> stats(String sessionId) {
        return ServiceSupport.selectAll(template, KeystrokeProfile.class)
                .map(rows -> {
                    if (rows.isEmpty()) {
                        return new KeystrokeStatsResponse(0, 0, 0, 0, -1, 0);
                    }
                    long total = rows.size();
                    double avgTotal = ServiceSupport.round(
                            rows.stream().mapToInt(KeystrokeProfile::totalMs).average().orElse(0), 1);
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
                });
    }

    /**
     * 计算自己样本与全站其他 session 样本的最小特征距离。
     * 距离 = 加权欧氏距离：按压时长权重 0.6，键间间隔权重 0.4（对齐到同长度）。
     *
     * @param mine 该 session 的样本
     * @param all  全站样本（含自己，会排除同 session）
     * @return 最小距离；无法计算（自己或他人样本不足）时返回 -1
     */
    private double computeNearestDistance(List<KeystrokeProfile> mine, List<KeystrokeProfile> all) {
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
        return min == Double.MAX_VALUE ? -1 : ServiceSupport.round(min, 1);
    }

    /**
     * 加权欧氏距离：对两段特征做逐元素对齐（截断到较短长度），hold 权重 0.6 / interval 权重 0.4。
     */
    private double weightedDistance(List<Integer> h1, List<Integer> i1, List<Integer> h2, List<Integer> i2) {
        int n = Math.min(Math.min(h1.size(), h2.size()), Math.min(i1.size(), i2.size()));
        if (n == 0) {
            return Double.MAX_VALUE;
        }
        double holdSum = 0;
        for (int k = 0; k < n; k++) {
            double d = h1.get(k) - h2.get(k);
            holdSum += d * d;
        }
        double intSum = 0;
        for (int k = 0; k < n; k++) {
            double d = i1.get(k) - i2.get(k);
            intSum += d * d;
        }
        return 0.6 * Math.sqrt(holdSum / n) + 0.4 * Math.sqrt(intSum / n);
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
}
