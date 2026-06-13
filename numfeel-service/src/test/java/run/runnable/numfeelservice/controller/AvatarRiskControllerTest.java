package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.test.StepVerifier;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AvatarRiskControllerTest {

    private AvatarRiskController controller;

    @BeforeEach
    void setUp() {
        controller = new AvatarRiskController();
    }

    @Test
    void track_shouldRecordEvent() {
        MockServerHttpRequest request = MockServerHttpRequest.post("/avatar-risk/track")
                .header("X-Forwarded-For", "1.2.3.4")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        Map<String, Object> body = Map.of("action", "avatar_loaded", "ts", System.currentTimeMillis());

        StepVerifier.create(controller.track(body, exchange))
                .assertNext(response -> {
                    assertEquals(200, response.getStatusCode().value());
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertEquals(true, respBody.get("recorded"));
                    assertTrue((Long) respBody.get("totalViews") > 0);
                })
                .verifyComplete();
    }

    @Test
    void checkUrl_safeHttpsUrl() {
        Map<String, String> body = Map.of("url", "https://cdn.example.com/avatar.jpg");

        StepVerifier.create(controller.checkUrl(body))
                .assertNext(response -> {
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertEquals(true, respBody.get("safe"));
                })
                .verifyComplete();
    }

    @Test
    void checkUrl_privateIpRejected() {
        Map<String, String> body = Map.of("url", "http://192.168.1.1/admin");

        StepVerifier.create(controller.checkUrl(body))
                .assertNext(response -> {
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertEquals(false, respBody.get("safe"));
                })
                .verifyComplete();
    }

    @Test
    void checkUrl_metadataRejected() {
        Map<String, String> body = Map.of("url", "http://169.254.169.254/latest/meta-data/");

        StepVerifier.create(controller.checkUrl(body))
                .assertNext(response -> {
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertEquals(false, respBody.get("safe"));
                })
                .verifyComplete();
    }

    @Test
    void checkUrl_svgRejected() {
        Map<String, String> body = Map.of("url", "https://cdn.example.com/avatar.svg");

        StepVerifier.create(controller.checkUrl(body))
                .assertNext(response -> {
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertEquals(false, respBody.get("safe"));
                })
                .verifyComplete();
    }

    @Test
    void checkUrl_emptyUrlBadRequest() {
        Map<String, String> body = Map.of("url", "");

        StepVerifier.create(controller.checkUrl(body))
                .assertNext(response -> {
                    assertEquals(400, response.getStatusCode().value());
                })
                .verifyComplete();
    }

    @Test
    void stats_shouldReturnCounts() {
        StepVerifier.create(controller.stats())
                .assertNext(response -> {
                    assertEquals(200, response.getStatusCode().value());
                    Map<String, Object> respBody = response.getBody();
                    assertNotNull(respBody);
                    assertNotNull(respBody.get("totalEvents"));
                })
                .verifyComplete();
    }
}
