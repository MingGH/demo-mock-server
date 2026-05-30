package run.runnable.numfeelservice.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

/**
 * 追踪、采集与问卷统计相关的 R2DBC 实体定义。
 * <p>
 * 这些实体供 service 层通过 {@code R2dbcEntityTemplate} 直接读写。
 */
public final class TrackingEntities {

    private TrackingEntities() {
    }

    /** 浏览器指纹采集记录表映射。 */
    @Table("browser_fingerprints")
    public record BrowserFingerprint(
            @Id Long id,
            @Column("full_hash") String fullHash,
            @Column("canvas_hash") String canvasHash,
            @Column("font_hash") String fontHash,
            @Column("webgl_hash") String webglHash,
            @Column("screen_info") String screenInfo,
            String timezone,
            String language,
            String platform,
            @Column("hardware_concurrency") Integer hardwareConcurrency,
            @Column("device_memory") Integer deviceMemory,
            @Column("touch_support") boolean touchSupport,
            @Column("color_depth") Integer colorDepth,
            @Column("pixel_ratio") Double pixelRatio,
            @Column("entropy_bits") Double entropyBits,
            @Column("ip_hint") String ipHint,
            @Column("created_at") long createdAt
    ) {
    }

    /** 验证码挑战结果表映射。 */
    @Table("captcha_results")
    public record CaptchaResult(
            @Id Long id,
            @Column("passed_count") int passedCount,
            @Column("total_time_ms") int totalTimeMs,
            String grade,
            @Column("lv_text") int lvText,
            @Column("lv_math") int lvMath,
            @Column("lv_slider") int lvSlider,
            @Column("lv_grid") int lvGrid,
            @Column("lv_click") int lvClick,
            @Column("lv_rotate") int lvRotate,
            @Column("lv_spatial") int lvSpatial,
            @Column("lv_behavior") int lvBehavior,
            @Column("time_text") int timeText,
            @Column("time_math") int timeMath,
            @Column("time_slider") int timeSlider,
            @Column("time_grid") int timeGrid,
            @Column("time_click") int timeClick,
            @Column("time_rotate") int timeRotate,
            @Column("time_spatial") int timeSpatial,
            @Column("time_behavior") int timeBehavior,
            @Column("created_at") long createdAt
    ) {
    }

    /** 社会工程学测试单题结果表映射。 */
    @Table("se_question_results")
    public record SocialEngineeringQuestion(
            @Id Long id,
            @Column("session_id") String sessionId,
            @Column("question_id") int questionId,
            String tactic,
            @Column("is_fake") boolean isFake,
            boolean correct,
            @Column("created_at") long createdAt
    ) {
    }

    /** 社会工程学测试场次汇总表映射。 */
    @Table("se_sessions")
    public record SocialEngineeringSession(
            @Id Long id,
            @Column("session_id") String sessionId,
            int total,
            int correct,
            @Column("all_correct") boolean allCorrect,
            @Column("created_at") long createdAt
    ) {
    }
}
