package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.service.CorsDemoService;
import tools.jackson.databind.JsonNode;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * {@link CorsDemoController} 单测：直接实例化 service + controller，聚焦会话隔离与业务逻辑，
 * 不启动 Spring 上下文。CORS 头部行为由 {@code CorsLabFilterTest} 覆盖。
 */
class CorsDemoControllerTest {

    private CorsDemoService service;
    private CorsDemoController controller;
    private String token;

    @BeforeEach
    void setUp() {
        service = new CorsDemoService();
        controller = new CorsDemoController(service);
        token = controller.session().block().getBody().get("data").get("token").asText();
    }

    @Test
    void session_returnsTokenAndInitialBalance() {
        StepVerifier.create(controller.session())
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertTrue(data.has("token"));
                    assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, data.get("balance").asInt());
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                })
                .verifyComplete();
    }

    @Test
    void me_returnsInitialBalanceAndDefaultDenyMode() {
        StepVerifier.create(controller.me(token))
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    var data = resp.getBody().get("data");
                    assertEquals("victim-demo-account", data.get("user").asText());
                    assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, data.get("balance").asInt());
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                })
                .verifyComplete();
    }

    @Test
    void setPolicy_switchesBetweenAllThreeModes() {
        for (String mode : new String[]{CorsDemoService.MODE_ALLOW, CorsDemoService.MODE_ALLOW_CREDENTIALS, CorsDemoService.MODE_DENY}) {
            StepVerifier.create(controller.setPolicy(token, Map.of("mode", mode)))
                    .assertNext(resp -> {
                        var data = resp.getBody().get("data");
                        assertTrue(data.get("success").asBoolean());
                        assertEquals(mode, data.get("mode").asText());
                    })
                    .verifyComplete();
            assertEquals(mode, service.currentMode(token));
        }
    }

    @Test
    void setPolicy_rejectsUnknownMode() {
        StepVerifier.create(controller.setPolicy(token, Map.of("mode", "open-sesame")))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertFalse(data.get("success").asBoolean());
                })
                .verifyComplete();
        assertEquals(CorsDemoService.MODE_DENY, service.currentMode(token));
    }

    @Test
    void transfer_deductsBalanceAndRecordsFlow() {
        controller.setPolicy(token, Map.of("mode", CorsDemoService.MODE_ALLOW)).block();
        int before = balanceOf(controller.me(token).block());
        int amount = 1234;

        StepVerifier.create(service.transfer(token, amount))
                .assertNext(result -> {
                    assertTrue(result.get("executed").toString().equals("true"));
                    assertEquals(before - amount, ((Number) result.get("balanceAfter")).intValue());
                })
                .verifyComplete();

        assertEquals(before - amount, balanceOf(controller.me(token).block()));
        StepVerifier.create(controller.transfers(token))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertEquals(1, data.get("count").asInt());
                })
                .verifyComplete();
    }

    @Test
    void transfer_rejectsNonPositiveAmount() {
        StepVerifier.create(service.transfer(token, 0))
                .assertNext(result -> {
                    assertEquals("false", result.get("executed").toString());
                })
                .verifyComplete();
        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, balanceOf(controller.me(token).block()));
    }

    @Test
    void reset_restoresBalanceClearsTransfersAndResetsMode() {
        controller.setPolicy(token, Map.of("mode", CorsDemoService.MODE_ALLOW)).block();
        service.transfer(token, 5000).block();

        StepVerifier.create(controller.reset(token))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertTrue(data.get("success").asBoolean());
                    assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, data.get("balance").asInt());
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                })
                .verifyComplete();

        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, balanceOf(controller.me(token).block()));
        StepVerifier.create(controller.transfers(token))
                .assertNext(resp -> {
                    assertEquals(0, resp.getBody().get("data").get("count").asInt());
                })
                .verifyComplete();
    }

    @Test
    void policy_listsAllThreeOptions() {
        StepVerifier.create(controller.policy(token))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                    assertTrue(data.get("options").isArray());
                    assertEquals(3, data.get("options").size());
                })
                .verifyComplete();
    }

    @Test
    void invalidToken_treatedAsExpired() {
        StepVerifier.create(controller.me("does-not-exist"))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertTrue(data.get("expired").asBoolean());
                })
                .verifyComplete();
        // 过期/无效 token 在过滤器眼里等同 deny
        assertEquals(CorsDemoService.MODE_DENY, service.currentMode("does-not-exist"));
    }

    @Test
    void sessionsAreIsolated_betweenVisitors() {
        // 访客 B 建立自己的会话
        String tokenB = controller.session().block().getBody().get("data").get("token").asText();

        // A 切 allow 并转账，B 保持 deny
        controller.setPolicy(token, Map.of("mode", CorsDemoService.MODE_ALLOW)).block();
        service.transfer(token, 10000).block();

        // B 的余额没受影响，B 的策略仍是 deny
        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, balanceOf(controller.me(tokenB).block()));
        assertEquals(CorsDemoService.MODE_DENY, service.currentMode(tokenB));
        StepVerifier.create(controller.transfers(tokenB))
                .assertNext(resp -> assertEquals(0, resp.getBody().get("data").get("count").asInt()))
                .verifyComplete();

        // A 的余额扣了，A 的策略是 allow
        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS - 10000, balanceOf(controller.me(token).block()));
        assertEquals(CorsDemoService.MODE_ALLOW, service.currentMode(token));
        StepVerifier.create(controller.transfers(token))
                .assertNext(resp -> assertEquals(1, resp.getBody().get("data").get("count").asInt()))
                .verifyComplete();
    }

    private static int balanceOf(ResponseEntity<JsonNode> resp) {
        return resp.getBody().get("data").get("balance").asInt();
    }
}
