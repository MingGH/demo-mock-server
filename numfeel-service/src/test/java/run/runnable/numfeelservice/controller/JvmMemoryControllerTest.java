package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.JvmMemoryService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * JvmMemoryController HTTP 层测试。
 * <p>
 * 使用真实 {@link JvmMemoryService}，验证快照接口能返回合法、对称的内存数据。
 */
class JvmMemoryControllerTest {

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToController(new JvmMemoryController(new JvmMemoryService()))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void snapshot_returns_valid_memory_data() {
        client.get().uri("/jvm-memory")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.pid").isNumber()
                .jsonPath("$.data.heapUsedMb").isNumber()
                .jsonPath("$.data.heapCommittedMb").isNumber()
                .jsonPath("$.data.heapMaxMb").isNumber()
                .jsonPath("$.data.liveThreads").isNumber()
                .jsonPath("$.data.loadedClasses").isNumber()
                .jsonPath("$.data.gc").isArray();
    }

    @Test
    void snapshot_heap_usage_is_sane() {
        client.get().uri("/jvm-memory")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.heapUsedMb").value(used -> {
                        assert ((Number) used).doubleValue() >= 0;
                })
                .jsonPath("$.data.heapMaxMb").value(max -> {
                        assert ((Number) max).doubleValue() > 0;
                });
    }

    @Test
    void snapshot_threads_reported() {
        client.get().uri("/jvm-memory")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.liveThreads").value(threads -> {
                        assert ((Number) threads).intValue() >= 0;
                })
                .jsonPath("$.data.totalStartedThreads").value(started -> {
                        assert ((Number) started).longValue() >= 0;
                });
    }
}