package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class SriDemoControllerTest {

    private final SriDemoController controller = new SriDemoController(WebClient.builder());

    @Test
    void demoScript_normalVersion_returnsNonMaliciousCode() {
        Mono<ResponseEntity<String>> result = controller.demoScript(false);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    String body = resp.getBody();
                    assertNotNull(body);
                    assertTrue(body.contains("script-status"));
                    assertTrue(body.contains("analytics.js"));
                    assertFalse(body.contains("键盘记录"));
                    assertFalse(body.contains("phishing"));
                })
                .verifyComplete();
    }

    @Test
    void demoScript_tamperedVersion_returnsMaliciousCode() {
        Mono<ResponseEntity<String>> result = controller.demoScript(true);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    String body = resp.getBody();
                    assertNotNull(body);
                    assertTrue(body.contains("已被篡改"));
                    assertTrue(body.contains("键盘记录"));
                    assertTrue(body.contains("keylog-panel"));
                    assertTrue(body.contains("phishing-overlay"));
                })
                .verifyComplete();
    }

    @Test
    void demoScript_contentTypeIsJavaScript() {
        Mono<ResponseEntity<String>> result = controller.demoScript(false);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    String contentType = resp.getHeaders().getFirst("Content-Type");
                    assertNotNull(contentType);
                    assertTrue(contentType.contains("application/javascript"));
                })
                .verifyComplete();
    }

    @Test
    void demoScript_hasCorsHeader() {
        Mono<ResponseEntity<String>> result = controller.demoScript(false);

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals("*", resp.getHeaders().getFirst("Access-Control-Allow-Origin"));
                })
                .verifyComplete();
    }

    @Test
    void demoHash_returnsSha384Format() {
        Mono<ResponseEntity<String>> result = controller.demoHash();

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    String body = resp.getBody();
                    assertNotNull(body);
                    assertTrue(body.startsWith("sha384-"));
                    // SHA-384 base64 encoded should be 64 chars
                    String hash = body.substring("sha384-".length());
                    assertEquals(64, hash.length());
                })
                .verifyComplete();
    }

    @Test
    void demoHash_consistentAcrossCalls() {
        String hash1 = controller.demoHash().block().getBody();
        String hash2 = controller.demoHash().block().getBody();
        assertEquals(hash1, hash2, "哈希值应该是确定性的");
    }
}
