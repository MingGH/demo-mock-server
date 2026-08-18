package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import run.runnable.numfeelservice.controller.dto.UploadResponses.UploadFile;
import run.runnable.numfeelservice.controller.dto.UploadResponses.UploadSummary;
import run.runnable.numfeelservice.service.MultipartUploadService;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * MultipartUploadController 单元测试。
 */
class MultipartUploadControllerTest {

    private final MultipartUploadService service = mock(MultipartUploadService.class);
    private final MultipartUploadController controller = new MultipartUploadController(service);

    @Test
    void upload_delegatesToServiceAndWrapsResult() {
        var exchange = mock(ServerWebExchange.class);
        var summary = new UploadSummary("abc123", 1, 11, 300,
                Map.of("note", "hi"), List.of(new UploadFile("file", "a.txt", "text/plain", 11)));

        when(service.handle(exchange)).thenReturn(Mono.just(summary));

        StepVerifier.create(controller.upload(exchange))
                .assertNext(resp -> {
                    assertEquals(200, resp.getStatusCode().value());
                    JsonNode body = resp.getBody();
                    assertNotNull(body);
                    assertEquals(200, body.get("status").asInt());
                    assertEquals("abc123", body.get("data").get("uploadId").asText());
                    assertEquals(1, body.get("data").get("fileCount").asInt());
                })
                .verifyComplete();

        verify(service).handle(exchange);
    }

    @Test
    void upload_propagatesServiceError() {
        var exchange = mock(ServerWebExchange.class);
        when(service.handle(exchange))
                .thenReturn(Mono.error(new RuntimeException("boom")));

        StepVerifier.create(controller.upload(exchange))
                .expectError(RuntimeException.class)
                .verify();
    }
}