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
 * {@link CorsDemoController} 单测：直接实例化 service + controller，聚焦业务逻辑，
 * 不启动 Spring 上下文。CORS 头部行为由 {@code CorsLabFilterTest} 覆盖。
 */
class CorsDemoControllerTest {

    private CorsDemoService service;
    private CorsDemoController controller;

    @BeforeEach
    void setUp() {
        service = new CorsDemoService();
        controller = new CorsDemoController(service);
    }

    @Test
    void me_returnsInitialBalanceAndDefaultDenyMode() {
        StepVerifier.create(controller.me())
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
            StepVerifier.create(controller.setPolicy(Map.of("mode", mode)))
                    .assertNext(resp -> {
                        var data = resp.getBody().get("data");
                        assertTrue(data.get("success").asBoolean());
                        assertEquals(mode, data.get("mode").asText());
                    })
                    .verifyComplete();
            assertEquals(mode, service.currentMode());
        }
    }

    @Test
    void setPolicy_rejectsUnknownMode() {
        StepVerifier.create(controller.setPolicy(Map.of("mode", "open-sesame")))
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertFalse(data.get("success").asBoolean());
                })
                .verifyComplete();
        assertEquals(CorsDemoService.MODE_DENY, service.currentMode());
    }

    @Test
    void transfer_deductsBalanceAndRecordsFlow() {
        controller.setPolicy(Map.of("mode", CorsDemoService.MODE_ALLOW)).block();
        int before = balanceOf(controller.me().block());
        int amount = 1234;

        StepVerifier.create(service.transfer(amount))
                .assertNext(result -> {
                    assertTrue(result.get("executed").toString().equals("true"));
                    assertEquals(before - amount, ((Number) result.get("balanceAfter")).intValue());
                })
                .verifyComplete();

        assertEquals(before - amount, balanceOf(controller.me().block()));
        StepVerifier.create(controller.transfers())
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertEquals(1, data.get("count").asInt());
                })
                .verifyComplete();
    }

    @Test
    void transfer_rejectsNonPositiveAmount() {
        StepVerifier.create(service.transfer(0))
                .assertNext(result -> {
                    assertEquals("false", result.get("executed").toString());
                })
                .verifyComplete();
        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, balanceOf(controller.me().block()));
    }

    @Test
    void reset_restoresBalanceClearsTransfersAndResetsMode() {
        controller.setPolicy(Map.of("mode", CorsDemoService.MODE_ALLOW)).block();
        service.transfer(5000).block();

        StepVerifier.create(controller.reset())
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertTrue(data.get("success").asBoolean());
                    assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, data.get("balance").asInt());
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                })
                .verifyComplete();

        assertEquals(CorsDemoService.INITIAL_BALANCE_CENTS, balanceOf(controller.me().block()));
        StepVerifier.create(controller.transfers())
                .assertNext(resp -> {
                    assertEquals(0, resp.getBody().get("data").get("count").asInt());
                })
                .verifyComplete();
    }

    @Test
    void policy_listsAllThreeOptions() {
        StepVerifier.create(controller.policy())
                .assertNext(resp -> {
                    var data = resp.getBody().get("data");
                    assertEquals(CorsDemoService.MODE_DENY, data.get("mode").asText());
                    assertTrue(data.get("options").isArray());
                    assertEquals(3, data.get("options").size());
                })
                .verifyComplete();
    }

    private static int balanceOf(ResponseEntity<JsonNode> resp) {
        return resp.getBody().get("data").get("balance").asInt();
    }
}
