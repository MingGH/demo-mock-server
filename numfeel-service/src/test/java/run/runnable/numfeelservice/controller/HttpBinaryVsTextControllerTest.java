package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.service.HttpBinaryDemoService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HttpBinaryVsTextController 单元测试。
 */
class HttpBinaryVsTextControllerTest {

    private final HttpBinaryDemoService service = new HttpBinaryDemoService();
    private final HttpBinaryVsTextController controller = new HttpBinaryVsTextController(service);
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    @Test
    void text_returnsOkWithJsonBody() {
        Mono<ResponseEntity<JsonNode>> result = controller.text();

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    String contentType = resp.getHeaders().getFirst("Content-Type");
                    assertNotNull(contentType);
                    assertTrue(contentType.contains("application/json"));
                    JsonNode body = resp.getBody();
                    assertNotNull(body);
                    assertTrue(body.has("users"));
                    assertTrue(body.has("posts"));
                    assertEquals(50, body.get("users").size());
                    assertEquals(80, body.get("posts").size());
                })
                .verifyComplete();
    }

    @Test
    void text_doesNotAddManualCorsHeader() {
        Mono<ResponseEntity<JsonNode>> result = controller.text();

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertNull(resp.getHeaders().getFirst("Access-Control-Allow-Origin"),
                            "应复用全局 CORS 配置，不在 Controller 中手动添加");
                })
                .verifyComplete();
    }

    @Test
    void binary_returnsOkWithOctetStreamBody() {
        Mono<ResponseEntity<byte[]>> result = controller.binary();

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    String contentType = resp.getHeaders().getFirst("Content-Type");
                    assertNotNull(contentType);
                    assertTrue(contentType.contains("application/octet-stream"));
                    byte[] body = resp.getBody();
                    assertNotNull(body);
                    assertTrue(body.length > 0);
                    assertEquals(body.length, resp.getHeaders().getContentLength());
                })
                .verifyComplete();
    }

    @Test
    void binary_doesNotAddManualCorsHeader() {
        Mono<ResponseEntity<byte[]>> result = controller.binary();

        StepVerifier.create(result)
                .assertNext(resp -> {
                    assertNull(resp.getHeaders().getFirst("Access-Control-Allow-Origin"),
                            "应复用全局 CORS 配置，不在 Controller 中手动添加");
                })
                .verifyComplete();
    }

    @Test
    void binaryBytesCanBeDecodedAsMessagePack() throws Exception {
        byte[] bytes = controller.binary().block().getBody();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper(
                new org.msgpack.jackson.dataformat.MessagePackFactory());
        var root = mapper.readTree(bytes);
        assertTrue(root.has("users"));
        assertTrue(root.has("posts"));
    }

    @Test
    void textAndBinaryContainSameData() throws Exception {
        JsonNode textBody = controller.text().block().getBody();
        byte[] binaryBytes = controller.binary().block().getBody();

        var msgpackMapper = new com.fasterxml.jackson.databind.ObjectMapper(
                new org.msgpack.jackson.dataformat.MessagePackFactory());
        var binaryBody = msgpackMapper.readTree(binaryBytes);

        assertEquals(textBody.get("users").size(), binaryBody.get("users").size());
        assertEquals(textBody.get("posts").size(), binaryBody.get("posts").size());
    }
}
