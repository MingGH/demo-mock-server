package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import run.runnable.numfeelservice.controller.dto.EventResponses.EventSummaryResponse;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 通用行为埋点 — 聚合摘要查询业务逻辑（只读）。
 * <p>
 * 只暴露聚合统计，不提供任何返回原始事件行的接口。查询全部走裸 SQL 聚合，
 * 不做 select 全量再内存过滤。结果按 demo 缓存 60 秒，减少高频访问对数据库的压力。
 */
@Service
public class EventSummaryService {

    private final DatabaseClient databaseClient;

    /** 按 demo slug 缓存摘要结果，60 秒 TTL。 */
    private final Cache<String, EventSummaryResponse> summaryCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(60))
            .maximumSize(1000)
            .build();

    public EventSummaryService(DatabaseClient databaseClient) {
        this.databaseClient = databaseClient;
    }

    /**
     * 查询指定 demo 的聚合摘要：会话数、事件总数、按事件名分组的计数。
     *
     * @param demo demo slug
     * @return 聚合摘要
     */
    public Mono<EventSummaryResponse> summary(String demo) {
        EventSummaryResponse cached = summaryCache.getIfPresent(demo);
        if (cached != null) {
            return Mono.just(cached);
        }

        Mono<long[]> countsMono = databaseClient.sql(
                        "SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions " +
                                "FROM demo_events WHERE demo_slug = ?")
                .bind(0, demo)
                .map((row, metadata) -> new long[]{
                        number(row.get("events")).longValue(),
                        number(row.get("sessions")).longValue()
                })
                .one()
                .defaultIfEmpty(new long[]{0L, 0L});

        Mono<Map<String, Long>> byEventMono = databaseClient.sql(
                        "SELECT event_name, COUNT(*) AS cnt FROM demo_events " +
                                "WHERE demo_slug = ? GROUP BY event_name ORDER BY cnt DESC")
                .bind(0, demo)
                .map((row, metadata) -> Map.entry(
                        (String) row.get("event_name"),
                        number(row.get("cnt")).longValue()))
                .all()
                .collectList()
                .map(entries -> {
                    Map<String, Long> map = new LinkedHashMap<>();
                    entries.forEach(e -> map.put(e.getKey(), e.getValue()));
                    return map;
                });

        return Mono.zip(countsMono, byEventMono)
                .map(tuple -> new EventSummaryResponse(tuple.getT1()[1], tuple.getT1()[0], tuple.getT2()))
                .doOnNext(resp -> summaryCache.put(demo, resp));
    }

    private Number number(Object value) {
        return value instanceof Number number ? number : 0;
    }
}
