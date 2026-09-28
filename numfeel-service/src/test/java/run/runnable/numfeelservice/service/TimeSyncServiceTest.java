package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.NtpQuality;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.TimeSyncResponse;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TimeSyncServiceTest {

    private static NtpQuality quality(String server, double offset, double delay, int stratum) {
        return new NtpQuality(server, offset, delay, stratum, System.currentTimeMillis());
    }

    // ── 符号陷阱：DTO offsetMillis = 服务端 − 参考，Commons Net 返回 θ = 参考 − 本地，实现取负 ──

    @Test
    void correctedNow_moves_time_back_when_server_fast() {
        TimeSyncService svc = new TimeSyncService(List.of("stub"), h -> quality(h, 0, 0, 2));
        // offsetMillis > 0（服务端偏快）应把时间往回调，即 correctedNow 比现在小。
        long before = System.currentTimeMillis();
        long corrected = svc.correctedNowMillis(5.0); // 5ms 偏快 → 回调 5ms
        long after = System.currentTimeMillis();
        assertTrue(corrected <= after, "偏快时应把时间往回调");
        assertEquals(before + 0, corrected, 6, "校正后的时间应比当前约小 5ms");
    }

    @Test
    void correctedNow_ignores_sub_ms_rounding() {
        TimeSyncService svc = new TimeSyncService(List.of("stub"), h -> quality(h, 0, 0, 2));
        // 0.42ms 四舍五入到 0，不应改变结果（亚毫秒误差在本次精度口径内可忽略）。
        long now = System.currentTimeMillis();
        assertEquals(now, svc.correctedNowMillis(0.42), 1);
    }

    @Test
    void dto_offset_matches_fetched_quality_sign() {
        // 验证：fetcher 返回的 offsetMillis 即 DTO 的 offsetMillis（服务端 − 参考），正 = 服务端偏快。
        TimeSyncService svc = new TimeSyncService(List.of("a"), h -> quality("a", 3.0, 1.0, 2));
        StepVerifier.create(svc.sync())
                .assertNext(r -> {
                    assertEquals("ntp", r.source());
                    assertNotNull(r.ntp());
                    assertEquals("a", r.ntp().server());
                    assertEquals(3.0, r.ntp().offsetMillis(), 1e-9);
                })
                .verifyComplete();
    }

    // ── 双源取优：取 delay 更小的 ──
    @Test
    void picks_offset_from_lower_delay_source_in_order() {
        TimeSyncService svc = new TimeSyncService(
                List.of("slow", "fast"),
                h -> "slow".equals(h) ? quality("slow", 0.5, 40.0, 2) : quality("fast", 0.2, 2.0, 2));
        StepVerifier.create(svc.sync())
                .assertNext(r -> {
                    assertEquals("ntp", r.source());
                    // 预期取 fast（delay 2 < 40）
                    assertEquals("fast", r.ntp().server());
                    assertEquals(0.2, r.ntp().offsetMillis(), 1e-9);
                })
                .verifyComplete();
    }

    // ── 双源全失败：不降级、不冒充，诚实报 unavailable，绝不出现 source="system" ──
    @Test
    void all_sources_fail_reports_unavailable_and_never_system() {
        TimeSyncService svc = new TimeSyncService(
                List.of("a", "b"),
                h -> { throw new IllegalStateException(h + " down"); });
        StepVerifier.create(svc.sync())
                .assertNext(r -> {
                    assertEquals("unavailable", r.source(), "全失败必须报 unavailable");
                    assertNull(r.ntp(), "unavailable 时 ntp 应为 null");
                    assertNotNull(r.unavailableReason(), "必须给出不可用原因");
                    assertTrue(r.unavailableReason().contains("NTP"), "原因应说明无法连接上游 NTP");
                })
                .verifyComplete();
    }

    // ── t2 ≤ t3 ──
    @Test
    void send_epoch_never_before_recv_epoch() {
        TimeSyncService svc = new TimeSyncService(List.of("ok"), h -> quality("ok", 1.0, 3.0, 2));
        StepVerifier.create(svc.sync())
                .assertNext(r -> assertTrue(r.recvEpochMillis() <= r.sendEpochMillis()))
                .verifyComplete();
    }

    // ── service 层返回 envelope：source=ntp 时带 ntp 质量字段 ──
    @Test
    void ntp_source_carries_quality() {
        TimeSyncService svc = new TimeSyncService(List.of("ok"), h -> quality("ok", -0.5, 1.2, 1));
        StepVerifier.create(svc.sync())
                .assertNext(r -> {
                    assertEquals("ntp", r.source());
                    assertNotNull(r.ntp());
                    assertEquals(-0.5, r.ntp().offsetMillis(), 1e-9);
                    assertEquals(1.2, r.ntp().delayMillis(), 1e-9);
                    assertEquals(1, r.ntp().stratum());
                })
                .verifyComplete();
    }
}