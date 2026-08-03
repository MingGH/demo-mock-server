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
     * {@code props} 对应表中的 JSON 列。r2dbc-mysql 把 {@code MySqlType.JSON} 标记为
     * string 类型，读写都走 {@code StringCodec}，因此这里映射为 Java {@code String}
     * 即可，service 层负责 Jackson 序列化/反序列化，不需要额外的类型处理器。
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
