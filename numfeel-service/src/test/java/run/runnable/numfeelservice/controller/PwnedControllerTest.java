package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;

class PwnedControllerTest {

    private final PwnedController controller = new PwnedController(WebClient.builder());

    @Test
    void isValidPrefix_acceptsFiveHexChars() {
        assertTrue(controller.isValidPrefix("5BAA6"));
        assertTrue(controller.isValidPrefix("00000"));
        assertTrue(controller.isValidPrefix("abcde"));
        assertTrue(controller.isValidPrefix("FfA01"));
    }

    @Test
    void isValidPrefix_rejectsInvalidInput() {
        assertFalse(controller.isValidPrefix(null));
        assertFalse(controller.isValidPrefix(""));
        assertFalse(controller.isValidPrefix("123"));        // 太短
        assertFalse(controller.isValidPrefix("123456"));     // 太长
        assertFalse(controller.isValidPrefix("XYZ12"));      // 非十六进制
        assertFalse(controller.isValidPrefix("5BAA "));      // 含空格
    }

    @Test
    void range_invalidPrefix_returns400() {
        Mono<ResponseEntity<JsonNode>> result = controller.range("nothex");

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(400, resp.getStatusCode().value());
                    JsonNode body = resp.getBody();
                    assertNotNull(body);
                    assertEquals(400, body.get("status").asInt());
                    assertTrue(body.get("message").asString().contains("十六进制"));
                })
                .verifyComplete();
    }

    @Test
    void rangeResult_holdsPrefixAndText() {
        var r = new PwnedController.RangeResult("5BAA6", "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365");
        assertEquals("5BAA6", r.prefix());
        assertTrue(r.range().contains("9659365"));
    }
}
