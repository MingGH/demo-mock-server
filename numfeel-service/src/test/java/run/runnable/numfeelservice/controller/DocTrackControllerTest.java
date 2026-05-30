package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.DocTrackEventsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityRequests.DocTrackQuery;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * DocTrackController 单元测试。
 */
class DocTrackControllerTest {

    private static final String IP_HEADER = "CF-Connecting-IP";

    @Test
    void pixel_returns_png_image() {
        DocTrackController controller = new DocTrackController();
        MockServerHttpRequest request = MockServerHttpRequest.get("/doc-track/pixel?id=test123")
                .header(IP_HEADER, "192.168.1.100")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")
                .build();

        ResponseEntity<byte[]> response = controller.pixel(new DocTrackQuery("test123"), request);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().length > 0);
    }

    @Test
    void pixel_null_query_still_returns_png() {
        DocTrackController controller = new DocTrackController();
        MockServerHttpRequest request = MockServerHttpRequest.get("/doc-track/pixel").build();

        ResponseEntity<byte[]> response = controller.pixel(null, request);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
    }

    @Test
    void events_valid_id_returns_json() {
        DocTrackController controller = new DocTrackController();
        MockServerHttpRequest request = MockServerHttpRequest.get("/doc-track/events")
                .header(IP_HEADER, "192.168.1.1")
                .header("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
                .build();

        controller.pixel(new DocTrackQuery("doc1"), request);

        ResponseEntity<JsonNode> response = controller.events(new DocTrackQuery("doc1"));

        assertEquals(200, response.getStatusCode().value());
        JsonNode body = response.getBody();
        assertNotNull(body);
        assertEquals(1, body.get("count").asInt());
        assertEquals(1, body.get("events").size());
    }

    @Test
    void events_missing_id_returns_400() {
        DocTrackController controller = new DocTrackController();

        ResponseEntity<JsonNode> response = controller.events(new DocTrackQuery(null));

        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void maskIp_masks_ipv4() {
        assertEquals("123.45.*.*", DocTrackController.maskIp("123.45.67.89"));
    }

    @Test
    void maskIp_returns_unknown_for_null() {
        assertEquals("unknown", DocTrackController.maskIp("unknown"));
    }

    @Test
    void maskIp_masks_ipv6() {
        String result = DocTrackController.maskIp("2001:db8::1");
        assertTrue(result.contains("****"));
    }

    @Test
    void parseDevice_detects_iphone() {
        assertEquals("iPhone", DocTrackController.parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"));
    }

    @Test
    void parseDevice_detects_windows() {
        assertEquals("Windows PC", DocTrackController.parseDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"));
    }

    @Test
    void parseDevice_unknown_for_null() {
        assertEquals("未知设备", DocTrackController.parseDevice(null));
    }

    @Test
    void parseOs_detects_windows_10() {
        assertEquals("Windows 10/11", DocTrackController.parseOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"));
    }

    @Test
    void parseOs_unknown_for_null() {
        assertEquals("未知系统", DocTrackController.parseOs(null));
    }
}
