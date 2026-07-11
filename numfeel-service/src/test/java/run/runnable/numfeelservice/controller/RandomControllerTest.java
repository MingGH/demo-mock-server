package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.QuantumRandomService;
import run.runnable.numfeelservice.service.QuantumRandomService.DigitsDraw;
import run.runnable.numfeelservice.service.QuantumRandomService.Entropy;
import run.runnable.numfeelservice.service.QuantumRandomService.LotteryDraw;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * RandomController HTTP 层测试，mock QuantumRandomService。
 */
class RandomControllerTest {

    private QuantumRandomService service;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        service = mock(QuantumRandomService.class);
        client = WebTestClient.bindToController(new RandomController(service))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void bytes_valid_returns_200_with_source() {
        when(service.bytes(anyInt(), nullable(String.class)))
                .thenReturn(Mono.just(new Entropy(List.of(1, 2, 3), "quantum",
                        "ANU QRNG", false, "quantum")));

        client.get().uri("/random/bytes?count=3&source=quantum")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.bytes.length()").isEqualTo(3)
                .jsonPath("$.data.source").isEqualTo("quantum")
                .jsonPath("$.data.provider").isEqualTo("ANU QRNG")
                .jsonPath("$.data.degraded").isEqualTo(false)
                .jsonPath("$.data.requestedSource").isEqualTo("quantum");
    }

    @Test
    void bytes_count_out_of_range_returns_400() {
        client.get().uri("/random/bytes?count=0")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void bytes_count_too_large_returns_400() {
        client.get().uri("/random/bytes?count=99999")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void bytes_service_error_returns_500() {
        when(service.bytes(anyInt(), nullable(String.class))).thenReturn(Mono.error(new RuntimeException("boom")));
        client.get().uri("/random/bytes?count=10")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void lottery_ssq_returns_200_with_red_blue() {
        when(service.drawLottery(anyString(), nullable(String.class))).thenReturn(Mono.just(
                new LotteryDraw("ssq", List.of(1, 7, 13, 20, 25, 33), 9, null, null, "quantum", "ANU QRNG", false)));

        client.get().uri("/random/lottery?type=ssq")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.type").isEqualTo("ssq")
                .jsonPath("$.data.red.length()").isEqualTo(6)
                .jsonPath("$.data.blue").isEqualTo(9)
                .jsonPath("$.data.source").isEqualTo("quantum");
    }

    @Test
    void lottery_dlt_returns_200_with_front_back() {
        when(service.drawLottery(anyString(), nullable(String.class))).thenReturn(Mono.just(
                new LotteryDraw("dlt", null, null, List.of(2, 8, 15, 22, 35), List.of(3, 11), "atmospheric", "random.org", true)));

        client.get().uri("/random/lottery?type=dlt")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.type").isEqualTo("dlt")
                .jsonPath("$.data.front.length()").isEqualTo(5)
                .jsonPath("$.data.back.length()").isEqualTo(2)
                .jsonPath("$.data.source").isEqualTo("atmospheric")
                .jsonPath("$.data.degraded").isEqualTo(true);
    }

    @Test
    void lottery_invalid_type_returns_400() {
        client.get().uri("/random/lottery?type=foo")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void digits_fixed_length_returns_value() {
        when(service.drawDigits(anyInt(), anyInt(), anyInt(), anyInt(), nullable(String.class)))
                .thenReturn(Mono.just(new DigitsDraw(null, "547281", "quantum", "ANU QRNG", false)));

        client.get().uri("/random/digits?length=6")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.value").isEqualTo("547281")
                .jsonPath("$.data.source").isEqualTo("quantum");
    }

    @Test
    void digits_range_returns_values_list() {
        when(service.drawDigits(anyInt(), anyInt(), anyInt(), anyInt(), nullable(String.class)))
                .thenReturn(Mono.just(new DigitsDraw(List.of(123, 456), null, "secure", "SecureRandom", true)));

        client.get().uri("/random/digits?min=100&max=999&count=2")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.values.length()").isEqualTo(2)
                .jsonPath("$.data.values[0]").isEqualTo(123);
    }

    @Test
    void digits_range_invalid_returns_400() {
        when(service.drawDigits(anyInt(), anyInt(), anyInt(), anyInt(), nullable(String.class)))
                .thenThrow(new IllegalArgumentException("count 须在 1..100"));
        client.get().uri("/random/digits?min=1&max=2")
                .exchange()
                .expectStatus().isEqualTo(400);
    }
}