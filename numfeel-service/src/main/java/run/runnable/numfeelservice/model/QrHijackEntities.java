package run.runnable.numfeelservice.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 二维码劫持演示使用的 R2DBC 实体定义。
 */
public final class QrHijackEntities {

    private QrHijackEntities() {
    }

    /** QR 登录 session 记录表映射。 */
    @Table("qr_hijack_sessions")
    public record QrHijackSession(
            @Id Long id,
            String token,
            String status,
            @Column("scanned_by") String scannedBy,
            @Column("created_at") long createdAt,
            @Column("scanned_at") long scannedAt,
            boolean hijacked
    ) {
    }
}
