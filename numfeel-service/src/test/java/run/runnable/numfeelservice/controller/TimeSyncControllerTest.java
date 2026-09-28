package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.NtpQuality;
import run.runnable.numfeelservice.controller.dto.TimeSyncResponses.TimeSyncResponse;
import run.runnable.numfeelservice.service.TimeSyncService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TimeSyncControllerTest {

    private TimeSyncService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(TimeSyncService.class);
        client = WebTestClient.bindToController(new TimeSyncController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void get_sync_returns_ntp_source() {
        NtpQuality q = new NtpQuality("ntp.aliyun.com", 0.42, 3.1, 2, 1790000000000L);
        TimeSyncResponse resp = new TimeSyncResponse(1790000000123L, 1790000000124L, "ntp", q, null);
        when(mockService.sync()).thenReturn(Mono.just(resp));

        client.get().uri("/time/sync")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.source").isEqualTo("ntp")
                .jsonPath("$.data.recvEpochMillis").isEqualTo(1790000000123L)
                .jsonPath("$.data.sendEpochMillis").isEqualTo(1790000000124L)
                .jsonPath("$.data.ntp.server").isEqualTo("ntp.aliyun.com")
                .jsonPath("$.data.ntp.offsetMillis").isEqualTo(0.42)
                .jsonPath("$.data.ntp.delayMillis").isEqualTo(3.1)
                .jsonPath("$.data.ntp.stratum").isEqualTo(2)
                .jsonPath("$.data.unavailableReason").doesNotExist();
    }

    @Test
    void get_sync_unavailable_returns_200_with_ntp_null() {
        TimeSyncResponse resp = new TimeSyncResponse(1790000000000L, 1790000000000L, "unavailable", null,
                "无法连接上游 NTP（UDP/123 超时或不可达）");
        when(mockService.sync()).thenReturn(Mono.just(resp));

        client.get().uri("/time/sync")
                .exchange()
                .expectStatus().isOk() // 不降级、不 500
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.source").isEqualTo("unavailable")
                .jsonPath("$.data.ntp").doesNotExist()
                .jsonPath("$.data.unavailableReason").isNotEmpty();
    }
}