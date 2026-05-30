package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpDailyPointResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpStatsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpSummaryResponse;
import run.runnable.numfeelservice.service.BlockIpService;
import run.runnable.numfeelservice.web.ApiResponse;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.http.ResponseEntity;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BlockIpControllerTest {

    @Mock
    private BlockIpService service;

    private BlockIpController controller;

    @BeforeEach
    void setUp() {
        controller = new BlockIpController(service);
    }

    private static final BlockIpStatsResponse SAMPLE_RESPONSE = new BlockIpStatsResponse(
            new BlockIpSummaryResponse(100, 500L, 5.0, 10, 5),
            List.of(new BlockIpDailyPointResponse("2025-01-01", 3)),
            List.of(),
            List.of(),
            List.of(),
            LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
    );

    @Test
    void statsShouldReturnOkWithData() {
        when(service.stats()).thenReturn(Mono.just(SAMPLE_RESPONSE));

        Mono<ResponseEntity<JsonNode>> result = controller.stats();
        ResponseEntity<JsonNode> response = result.block();

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
    }

    @Test
    void statsShouldIncludeCacheHeader() {
        when(service.stats()).thenReturn(Mono.just(SAMPLE_RESPONSE));

        Mono<ResponseEntity<JsonNode>> result = controller.stats();
        ResponseEntity<JsonNode> response = result.block();

        assertEquals("public, max-age=300", response.getHeaders().getFirst("Cache-Control"));
    }

    @Test
    void statsShouldReturn500OnServiceError() {
        when(service.stats()).thenReturn(Mono.error(new RuntimeException("Upstream timeout")));

        Mono<ResponseEntity<JsonNode>> result = controller.stats();
        ResponseEntity<JsonNode> response = result.block();

        assertEquals(500, response.getStatusCode().value());
        assertTrue(response.getBody().toString().contains("Internal error"));
    }

    @Test
    void statsShouldReturnJsonContentType() {
        when(service.stats()).thenReturn(Mono.just(SAMPLE_RESPONSE));

        Mono<ResponseEntity<JsonNode>> result = controller.stats();
        ResponseEntity<JsonNode> response = result.block();

        assertTrue(response.getHeaders().getContentType().toString().contains("application/json"));
    }
}
