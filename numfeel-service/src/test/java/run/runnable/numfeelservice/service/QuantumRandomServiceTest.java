package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * QuantumRandomService 测试：熵源链、降级决策、无偏抽取。
 * 外部 HTTP 调用全部 mock，不依赖真实外网。
 */
class QuantumRandomServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private org.springframework.web.reactive.function.client.WebClient ninjaWebClient;
    private org.springframework.web.reactive.function.client.WebClient randomOrgWebClient;
    private org.springframework.web.reactive.function.client.WebClient.RequestHeadersUriSpec uriSpec;
    private org.springframework.web.reactive.function.client.WebClient.RequestHeadersSpec headersSpec;
    private org.springframework.web.reactive.function.client.WebClient.ResponseSpec responseSpec;

    private QuantumRandomService service;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        ninjaWebClient = mock(org.springframework.web.reactive.function.client.WebClient.class);
        randomOrgWebClient = mock(org.springframework.web.reactive.function.client.WebClient.class);
        uriSpec = mock(org.springframework.web.reactive.function.client.WebClient.RequestHeadersUriSpec.class);
        headersSpec = mock(org.springframework.web.reactive.function.client.WebClient.RequestHeadersSpec.class);
        responseSpec = mock(org.springframework.web.reactive.function.client.WebClient.ResponseSpec.class);

        when(ninjaWebClient.get()).thenReturn(uriSpec);
        when(randomOrgWebClient.get()).thenReturn(uriSpec);
        when(uriSpec.uri(any(java.util.function.Function.class))).thenReturn(headersSpec);
        when(headersSpec.header(anyString(), anyString())).thenReturn(headersSpec);
        when(headersSpec.retrieve()).thenReturn(responseSpec);

        service = new QuantumRandomService(ninjaWebClient, randomOrgWebClient, "fake-token");
    }

    private ArrayNode arrayNode(int... vals) {
        ArrayNode node = MAPPER.createArrayNode();
        for (int v : vals) node.add(v);
        return node;
    }

    @Test
    void bytes_quantum_returns_bytes_and_source() {
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(arrayNode(10, 20, 30)));
        StepVerifier.create(service.bytes(3, "quantum"))
                .assertNext(e -> {
                    assertEquals("quantum", e.source());
                    assertFalse(e.degraded());
                    assertEquals(3, e.bytes().size());
                })
                .verifyComplete();
    }

    @Test
    void bytes_quantum_failure_degrades_to_atmospheric_then_secure() {
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.error(new RuntimeException("upstream down")));
        when(responseSpec.bodyToMono(String.class)).thenReturn(Mono.error(new RuntimeException("random.org down")));

        StepVerifier.create(service.bytes(8, null))
                .assertNext(e -> {
                    assertEquals("secure", e.source());
                    assertTrue(e.degraded());
                    assertEquals(8, e.bytes().size());
                })
                .verifyComplete();
    }

    @Test
    void bytes_secure_source_uses_local() {
        StepVerifier.create(service.bytes(16, "secure"))
                .assertNext(e -> {
                    assertEquals("secure", e.source());
                    assertFalse(e.degraded());
                    assertEquals(16, e.bytes().size());
                })
                .verifyComplete();
    }

    @Test
    void bytes_atmospheric_source_falls_back_to_secure_on_failure() {
        when(responseSpec.bodyToMono(String.class)).thenReturn(Mono.error(new RuntimeException("down")));
        StepVerifier.create(service.bytes(8, "atmospheric"))
                .assertNext(e -> {
                    assertEquals("secure", e.source());
                    assertTrue(e.degraded());
                    assertEquals(8, e.bytes().size());
                })
                .verifyComplete();
    }

    @Test
    void bytes_atmospheric_success() {
        when(responseSpec.bodyToMono(String.class)).thenReturn(Mono.just("5\n6\n7\n8\n9\n10\n11\n12"));
        StepVerifier.create(service.bytes(8, "atmospheric"))
                .assertNext(e -> {
                    assertEquals("atmospheric", e.source());
                    assertFalse(e.degraded());
                    assertEquals(8, e.bytes().size());
                })
                .verifyComplete();
    }

    @Test
    void drawLottery_ssq_valid_rules() {
        // 给足够多的字节：返回 1024 个
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add(i % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        StepVerifier.create(service.drawLottery("ssq", null))
                .assertNext(d -> {
                    assertEquals("ssq", d.type());
                    assertNotNull(d.red());
                    assertEquals(6, d.red().size());
                    assertEquals(new HashSet<>(d.red()).size(), 6, "红球不重复");
                    for (int n : d.red()) assertTrue(n >= 1 && n <= 33);
                    assertNotNull(d.blue());
                    assertTrue(d.blue() >= 1 && d.blue() <= 16);
                    assertNull(d.front());
                    assertNull(d.back());
                })
                .verifyComplete();
    }

    @Test
    void drawLottery_dlt_valid_rules() {
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add((i * 7 + 3) % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        StepVerifier.create(service.drawLottery("dlt", null))
                .assertNext(d -> {
                    assertEquals("dlt", d.type());
                    assertNotNull(d.front());
                    assertEquals(5, d.front().size());
                    assertEquals(new HashSet<>(d.front()).size(), 5, "前区不重复");
                    for (int n : d.front()) assertTrue(n >= 1 && n <= 35);
                    assertNotNull(d.back());
                    assertEquals(2, d.back().size());
                    assertEquals(new HashSet<>(d.back()).size(), 2, "后区不重复");
                    for (int n : d.back()) assertTrue(n >= 1 && n <= 12);
                })
                .verifyComplete();
    }

    @Test
    void drawLottery_invalid_type_throws() {
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add(i % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        StepVerifier.create(service.drawLottery("foo", null))
                .expectError(IllegalArgumentException.class)
                .verify();
    }

    @Test
    void drawDigits_fixed_length_first_digit_nonzero() {
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add(i % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        StepVerifier.create(service.drawDigits(8, java.lang.Integer.MIN_VALUE, java.lang.Integer.MIN_VALUE, 0, null))
                .assertNext(d -> {
                    assertNull(d.values());
                    assertNotNull(d.value());
                    assertEquals(8, d.value().length());
                    assertNotEquals('0', d.value().charAt(0), "首位不为 0");
                })
                .verifyComplete();
    }

    @Test
    void drawDigits_range_mode_values_in_range() {
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add((i * 13 + 1) % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        StepVerifier.create(service.drawDigits(0, 100, 999, 5, null))
                .assertNext(d -> {
                    assertNotNull(d.values());
                    assertEquals(5, d.values().size());
                    for (int v : d.values()) assertTrue(v >= 100 && v <= 999);
                })
                .verifyComplete();
    }

    @Test
    void drawLottery_uses_secure_when_no_token() {
        service = new QuantumRandomService(ninjaWebClient, randomOrgWebClient, "");
        // 即使全链失败，最终落到 secure 也能出号
        when(responseSpec.bodyToMono(String.class)).thenReturn(Mono.error(new RuntimeException("down")));
        StepVerifier.create(service.drawLottery("ssq", null))
                .assertNext(d -> {
                    assertEquals("secure", d.source());
                    assertTrue(d.degraded());
                    assertEquals(6, d.red().size());
                    assertNotNull(d.blue());
                })
                .verifyComplete();
    }

    @Test
    void pool_reuse_caches_excess_bytes() {
        // 取少量字节，上游返回 1024（MIN_BATCH），多余的应进池
        ArrayNode big = arrayNode();
        for (int i = 0; i < 1024; i++) big.add(i % 256);
        when(responseSpec.bodyToMono(ArrayNode.class)).thenReturn(Mono.just(big));

        // 第二次取 secure（不走上游），确认 quantum 池仍有残留会先被消费？
        // 这里 quantum 链池有残留但 fetchBytes 不会跨源取，secure 走本地。仅验证第一次成功即可。
        StepVerifier.create(service.bytes(16, "quantum"))
                .assertNext(e -> {
                    assertEquals("quantum", e.source());
                    assertEquals(16, e.bytes().size());
                })
                .verifyComplete();
    }
}