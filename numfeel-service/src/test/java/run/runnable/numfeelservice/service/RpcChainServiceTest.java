package run.runnable.numfeelservice.service;

import java.io.IOException;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.RpcChainReport;
import run.runnable.numfeelservice.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * RpcChainService 单元测试。
 * <p>
 * 用 MockWebServer 扮演 echo 微服务，验证链路计时、参数校验与上游错误映射。
 */
class RpcChainServiceTest {

    private static final String ECHO_BODY =
            "{\"service\":\"numfeel-echo\",\"delay_ms\":0,\"took_us\":150,\"slept_us\":120}";

    private MockWebServer mockServer;

    private RpcChainService service;

    @BeforeEach
    void setUp() throws IOException {
        mockServer = new MockWebServer();
        mockServer.start();
        service = new RpcChainService(mockServer.url("/").toString());
    }

    @AfterEach
    void tearDown() throws IOException {
        mockServer.shutdown();
    }

    // ── 链路执行 ────────────────────────────────────────────────────────

    @Test
    void runChain_twoHops_returnsReportWithTimings() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(ECHO_BODY));
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(ECHO_BODY));

        StepVerifier.create(service.runChain(2, 0))
                .assertNext(report -> {
                    assertThat(report.hops()).isEqualTo(2);
                    assertThat(report.delayMs()).isZero();
                    assertThat(report.hopTimings()).hasSize(2);
                    assertThat(report.hopTimings().get(0).hop()).isEqualTo(1);
                    assertThat(report.hopTimings().get(1).hop()).isEqualTo(2);
                    assertThat(report.hopTimings().get(0).upstreamUs()).isEqualTo(150);
                    assertThat(report.totalMillis()).isPositive();
                    assertThat(report.avgHopMillis()).isPositive();
                    assertThat(report.overheadMillis()).isGreaterThanOrEqualTo(0);
                    assertThat(report.methodCallBaseline().iterations()).isEqualTo(1_000_000);
                    assertThat(report.methodCallBaseline().avgNanos()).isPositive();
                })
                .verifyComplete();

        RecordedRequest req = mockServer.takeRequest();
        assertThat(req.getMethod()).isEqualTo("GET");
        assertThat(req.getRequestUrl().encodedPath()).isEqualTo("/echo");
        assertThat(req.getRequestUrl().queryParameter("delay_ms")).isEqualTo("0");
    }

    @Test
    void runChain_passesDelayToEcho() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(ECHO_BODY));

        StepVerifier.create(service.runChain(1, 80))
                .assertNext(report -> assertThat(report.delayMs()).isEqualTo(80))
                .verifyComplete();

        RecordedRequest req = mockServer.takeRequest();
        assertThat(req.getRequestUrl().queryParameter("delay_ms")).isEqualTo("80");
    }

    // ── 参数校验（不触网，无需 enqueue） ────────────────────────────────

    @Test
    void runChain_zeroHops_rejected() {
        StepVerifier.create(service.runChain(0, 0))
                .expectErrorMatches(err -> err instanceof ApiException
                        && err.getMessage().contains("hops"))
                .verify();
    }

    @Test
    void runChain_hopsOverLimit_rejected() {
        StepVerifier.create(service.runChain(21, 0))
                .expectErrorMatches(err -> err instanceof ApiException
                        && err.getMessage().contains("hops"))
                .verify();
    }

    @Test
    void runChain_negativeDelay_rejected() {
        StepVerifier.create(service.runChain(1, -1))
                .expectErrorMatches(err -> err instanceof ApiException
                        && err.getMessage().contains("delayMs"))
                .verify();
    }

    @Test
    void runChain_delayOverLimit_rejected() {
        StepVerifier.create(service.runChain(1, 501))
                .expectErrorMatches(err -> err instanceof ApiException
                        && err.getMessage().contains("delayMs"))
                .verify();
    }

    // ── 上游错误映射 ────────────────────────────────────────────────────

    @Test
    void runChain_upstreamError_mapsTo502() {
        mockServer.enqueue(new MockResponse().setResponseCode(500));

        StepVerifier.create(service.runChain(1, 0))
                .expectErrorMatches(err -> err instanceof ApiException
                        && ((ApiException) err).status() == 502
                        && err.getMessage().contains("echo 服务不可达"))
                .verify();
    }

    // ── 方法调用对照组 ──────────────────────────────────────────────────

    @Test
    void baselineAvgNanos_isPositiveAndSane() {
        double avgNanos = service.baselineAvgNanos();
        // 纳秒级方法调用；上限放宽到 1µs/次，慢机器/冷 JIT 也不至于误报
        assertThat(avgNanos).isPositive().isLessThan(1_000);
    }
}
