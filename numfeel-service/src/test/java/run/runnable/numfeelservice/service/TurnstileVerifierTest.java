package run.runnable.numfeelservice.service;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.test.StepVerifier;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TurnstileVerifier 单元测试。
 */
class TurnstileVerifierTest {

    private MockWebServer mockServer;
    private TurnstileVerifier verifier;

    @BeforeEach
    void setUp() throws IOException {
        mockServer = new MockWebServer();
        mockServer.start();
        String siteVerifyUrl = mockServer.url("/turnstile/v0/siteverify").toString();
        verifier = new TurnstileVerifier("test-secret-key", siteVerifyUrl, WebClient.builder());
    }

    @AfterEach
    void tearDown() throws IOException {
        mockServer.shutdown();
    }

    // ── token 为空 ──────────────────────────────────────────────────────

    @Test
    void verify_nullToken_returnsError() {
        StepVerifier.create(verifier.verify(null, "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "turnstile token is required".equals(err.getMessage()))
                .verify();
    }

    @Test
    void verify_blankToken_returnsError() {
        StepVerifier.create(verifier.verify("  ", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "turnstile token is required".equals(err.getMessage()))
                .verify();
    }

    @Test
    void verify_emptyToken_returnsError() {
        StepVerifier.create(verifier.verify("", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "turnstile token is required".equals(err.getMessage()))
                .verify();
    }

    // ── 验证成功 ────────────────────────────────────────────────────────

    @Test
    void verify_success_returnsEmpty() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true}"));

        StepVerifier.create(verifier.verify("valid-token", "127.0.0.1"))
                .verifyComplete();

        RecordedRequest req = mockServer.takeRequest();
        assertThat(req.getMethod()).isEqualTo("POST");
        assertThat(req.getRequestUrl().encodedPath()).isEqualTo("/turnstile/v0/siteverify");
        String body = req.getBody().readUtf8();
        assertThat(body).contains("secret=test-secret-key");
        assertThat(body).contains("response=valid-token");
        assertThat(body).contains("remoteip=127.0.0.1");
    }

    @Test
    void verify_successWithNullRemoteIp_sendsEmptyString() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true}"));

        StepVerifier.create(verifier.verify("valid-token", null))
                .verifyComplete();

        RecordedRequest req = mockServer.takeRequest();
        String body = req.getBody().readUtf8();
        assertThat(body).contains("remoteip=");
    }

    // ── 验证失败 ────────────────────────────────────────────────────────

    @Test
    void verify_failure_returnsErrorWithCodes() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":false,\"error-codes\":[\"invalid-input-response\",\"timeout-or-duplicate\"]}"));

        StepVerifier.create(verifier.verify("bad-token", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && err.getMessage().contains("Turnstile verification failed")
                        && err.getMessage().contains("invalid-input-response")
                        && err.getMessage().contains("timeout-or-duplicate"))
                .verify();
    }

    @Test
    void verify_failureWithoutErrorCodes_returnsErrorWithUnknown() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":false}"));

        StepVerifier.create(verifier.verify("bad-token", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && err.getMessage().contains("unknown"))
                .verify();
    }

    // ── 网络错误 ────────────────────────────────────────────────────────

    @Test
    void verify_networkError_returnsUnavailable() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(500));

        StepVerifier.create(verifier.verify("token", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "Turnstile verification unavailable".equals(err.getMessage()))
                .verify();
    }

    @Test
    void verify_expectedAction_matchesResponse() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true,\"action\":\"iq-matrix-submit\",\"hostname\":\"numfeel.996.ninja\"}"));

        StepVerifier.create(verifier.verify("valid-token", "127.0.0.1", "iq-matrix-submit"))
                .verifyComplete();
    }

    @Test
    void verify_expectedAction_rejectsTokenFromAnotherWidget() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true,\"action\":\"another-action\"}"));

        StepVerifier.create(verifier.verify("valid-token", "127.0.0.1", "iq-matrix-submit"))
                .expectErrorMatches(error -> error instanceof IllegalArgumentException
                        && "Turnstile action mismatch".equals(error.getMessage()))
                .verify();
    }

    @Test
    void verify_expectedHostname_matchesResponse() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true,\"action\":\"iq-matrix-submit\",\"hostname\":\"numfeel.996.ninja\"}"));

        StepVerifier.create(verifier.verify("valid-token", "127.0.0.1",
                        "iq-matrix-submit", "numfeel.996.ninja"))
                .verifyComplete();
    }

    @Test
    void verify_expectedHostname_rejectsAnotherHost() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"success\":true,\"action\":\"iq-matrix-submit\",\"hostname\":\"evil.example\"}"));

        StepVerifier.create(verifier.verify("valid-token", "127.0.0.1",
                        "iq-matrix-submit", "numfeel.996.ninja"))
                .expectErrorMatches(error -> error instanceof IllegalArgumentException
                        && "Turnstile hostname mismatch".equals(error.getMessage()))
                .verify();
    }

    @Test
    void verify_invalidJsonResponse_returnsUnavailable() {
        mockServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("not json"));

        StepVerifier.create(verifier.verify("token", "127.0.0.1"))
                .expectErrorMatches(err -> err instanceof IllegalArgumentException
                        && "Turnstile verification unavailable".equals(err.getMessage()))
                .verify();
    }
}
