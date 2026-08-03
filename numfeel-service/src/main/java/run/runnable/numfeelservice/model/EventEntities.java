package run.runnable.numfeelservice.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 通用行为埋点相关的 R2DBC 实体定义。
 * <p>
 * 所有 demo 共用 {@code demo_events} 一张表，不按 demo 分表。
 */
public final class EventEntities {

    private EventEntities() {
    }

    /**
     * 通用行为埋点事件表映射。
     * <p>
     * {@code props} 本应使用 JSON 列，但项目内 r2dbc-mysql 绑定 JSON 类型缺乏先例，
     * 这里降级为 TEXT，由 service 层负责 Jackson 序列化/反序列化。
     */
    @Table("demo_events")
    public record DemoEvent(
            @Id Long id,
            @Column("demo_slug") String demoSlug,
            @Column("event_name") String eventName,
            @Column("session_id") String sessionId,
            int seq,
            String props,
            @Column("client_ts") long clientTs,
            @Column("created_at") long createdAt,
            @Column("ip_hash") String ipHash
    ) {
    }
}
