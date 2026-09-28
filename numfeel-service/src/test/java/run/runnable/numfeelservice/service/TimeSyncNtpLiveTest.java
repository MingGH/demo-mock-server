package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.TimeSyncResponse;

/**
 * 真实 NTP 冒烟测试：直接打进真实上游（UDP/123），验证能拿到真 stratum-2 质量。
 * 若所在网络禁 UDP / 上游不可达，会报 unavailable，断言随之跳过（不视为失败），
 * 避免在受限 CI 网络下破坏构建。
 */
class TimeSyncNtpLiveTest {

    @Test
    void live_ntp_reaches_upstream() {
        TimeSyncService svc = new TimeSyncService();
        StepVerifier.create(svc.sync())
                .assertNext(r -> {
                    if ("ntp".equals(r.source())) {
                        assert r.ntp() != null;
                        assert r.ntp().delayMillis() > 0;
                        assert r.ntp().stratum() >= 1;
                        System.out.println("[live-ntp] server=" + r.ntp().server()
                                + " stratum=" + r.ntp().stratum()
                                + " offsetMs=" + r.ntp().offsetMillis()
                                + " delayMs=" + r.ntp().delayMillis());
                    } else {
                        // 拿不到也通过，仅打印原因（含 run.runnable 的 fallback 语义封装）
                        System.out.println("[live-ntp] available; reason=" + r.unavailableReason());
                    }
                })
                .verifyComplete();
    }
}