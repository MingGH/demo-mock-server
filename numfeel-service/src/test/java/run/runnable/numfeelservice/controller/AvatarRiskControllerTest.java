package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.service.AvatarRiskService;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

class AvatarRiskControllerTest {

    private final AvatarRiskService service = new AvatarRiskService();
    private final AvatarRiskController controller = new AvatarRiskController(service);

    /** 从 session 创建响应里取 token。 */
    private String newToken() {
        ResponseEntity<JsonNode> resp = controller.createSession().block();
        assertNotNull(resp);
        JsonNode body = resp.getBody();
        assertNotNull(body);
        return body.get("data").get("token").asString();
    }

    @Test
    void createSession_returnsTokenAndAvatarPath() {
        ResponseEntity<JsonNode> resp = controller.createSession().block();
        assertNotNull(resp);
        assertEquals(200, resp.getStatusCode().value());
        JsonNode data = resp.getBody().get("data");
        String token = data.get("token").asString();
        assertTrue(token.matches("^[a-f0-9]{32}$"), "token 应该是 32 位十六进制");
        assertEquals("/avatar-risk/avatar/" + token, data.get("avatarPath").asString());
    }

    @Test
    void toggle_invalidScenario_throwsBadRequest() {
        String token = newToken();
        assertThrows(RuntimeException.class, () ->
                controller.toggle(java.util.Map.of(
                        "token", token,
                        "scenario", "drop_table",
                        "enabled", true)));
    }

    @Test
    void toggle_validScenario_persistsState() {
        String token = newToken();
        var resp = controller.toggle(java.util.Map.of(
                "token", token,
                "scenario", "horror",
                "enabled", true)).block();
        assertNotNull(resp);
        JsonNode scenarios = resp.getBody().get("data").get("scenarios");
        assertTrue(scenarios.get("horror").asBoolean());
        assertFalse(scenarios.get("redirect").asBoolean());
    }

    @Test
    void avatar_invalidToken_returns400() {
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/short"));
        var resp = controller.avatar("short", exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void avatar_unknownToken_returns404() {
        String fake = "00000000000000000000000000000000";
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/" + fake));
        var resp = controller.avatar(fake, exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.NOT_FOUND, resp.getStatusCode());
    }

    @Test
    void avatar_brokenScenario_returns404() {
        String token = newToken();
        controller.toggle(java.util.Map.of("token", token, "scenario", "broken", "enabled", true)).block();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/" + token));
        var resp = controller.avatar(token, exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.NOT_FOUND, resp.getStatusCode());
    }

    @Test
    void avatar_authPromptScenario_returns401WithWwwAuthenticate() {
        String token = newToken();
        controller.toggle(java.util.Map.of("token", token, "scenario", "authPrompt", "enabled", true)).block();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/" + token));
        var resp = controller.avatar(token, exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.UNAUTHORIZED, resp.getStatusCode());
        assertNotNull(resp.getHeaders().getFirst("WWW-Authenticate"));
    }

    @Test
    void avatar_redirectScenario_returns302ToLocalhost() {
        String token = newToken();
        controller.toggle(java.util.Map.of("token", token, "scenario", "redirect", "enabled", true)).block();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/" + token));
        var resp = controller.avatar(token, exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.FOUND, resp.getStatusCode());
        String location = resp.getHeaders().getLocation().toString();
        assertTrue(location.contains("localhost:8080"), "应跳转到 localhost:8080");
    }

    @Test
    void avatar_normalScenario_returnsJpeg() {
        String token = newToken();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/avatar-risk/avatar/" + token));
        var resp = controller.avatar(token, exchange).block();
        assertNotNull(resp);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("image/jpeg", resp.getHeaders().getContentType().toString());
        assertTrue(resp.getBody() instanceof byte[]);
    }

    @Test
    void logs_recordsClientInfoFromAvatarFetch() {
        String token = newToken();
        var exchange = MockServerWebExchange.from(MockServerHttpRequest
                .get("/avatar-risk/avatar/" + token)
                .header("User-Agent", "TestBot/1.0")
                .header("Referer", "https://victim.example.com/profile"));
        controller.avatar(token, exchange).block();

        var logsResp = controller.logs(token).block();
        assertNotNull(logsResp);
        JsonNode data = logsResp.getBody().get("data");
        assertEquals(1, data.get("count").asInt());
        JsonNode entry = data.get("logs").get(0);
        assertEquals("TestBot/1.0", entry.get("userAgent").asString());
        assertTrue(entry.get("referer").asString().contains("victim.example.com"));
    }

    @Test
    void state_unknownToken_returnsExistsFalse() {
        String fake = "ffffffffffffffffffffffffffffffff";
        var resp = controller.state(fake).block();
        assertNotNull(resp);
        assertFalse(resp.getBody().get("data").get("exists").asBoolean());
    }

    @Test
    void stats_incrementsCounters() {
        long before = service.stats().block().get("totalSessions") instanceof Long l ? l : 0L;
        newToken();
        newToken();
        Long after = (Long) service.stats().block().get("totalSessions");
        assertNotNull(after);
        assertTrue(after >= before + 2);
    }

    @Test
    void serviceMono_pipeline_completes() {
        String token = newToken();
        StepVerifier.create(service.toggleScenario(token, "horror", true))
                .assertNext(m -> assertEquals(Boolean.TRUE, m.get("success")))
                .verifyComplete();
    }
}
