package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.http.codec.multipart.FormFieldPart;
import org.springframework.http.codec.multipart.Part;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import run.runnable.numfeelservice.controller.dto.UploadResponses.UploadFile;
import run.runnable.numfeelservice.web.ApiException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * MultipartUploadService 单元测试。
 * 覆盖：流式落盘、字段解析、单文件超限 400、小时配额 429、空内容 400、到期删除。
 */
class MultipartUploadServiceTest {

    @TempDir
    Path tempDir;

    private MultipartUploadService service;

    @AfterEach
    void tearDown() {
        if (service != null) {
            service.shutdown();
        }
    }

    /** 构造一个测试用 service，限制与删除延迟均可控。 */
    private MultipartUploadService newService(long maxFileBytes, long maxHourlyBytes, long ttlMs) {
        service = new MultipartUploadService(tempDir.toString(), maxFileBytes, maxHourlyBytes, ttlMs);
        return service;
    }

    private UploadFile file(String name, long size) {
        return new UploadFile("file", name, "text/plain", size);
    }

    // ── 核心逻辑：process（配额 + 汇总） ──

    @Test
    void process_underQuota_returnsSummary() {
        MultipartUploadService s = newService(1024, 1024 * 1024, 60_000);
        Map<String, String> fields = Map.of("note", "备注");

        StepVerifier.create(s.process("1.1.1.1", fields, List.of(file("a.txt", 11)), "upload-1"))
                .assertNext(summary -> {
                    assertEquals(1, summary.fileCount());
                    assertEquals(11, summary.totalBytes());
                    assertEquals("备注", summary.fields().get("note"));
                    assertEquals("upload-1", summary.uploadId());
                    assertEquals(60, summary.expiresInSeconds());
                })
                .verifyComplete();
    }

    @Test
    void process_exceedsHourlyQuota_returns429() {
        // 每 IP 小时上限只有 15 字节
        MultipartUploadService s = newService(1024, 15, 60_000);

        StepVerifier.create(s.process("1.1.1.1", Map.of(), List.of(file("1.txt", 11)), "u1"))
                .expectNextCount(1)
                .verifyComplete();

        // 第二次 11 字节会让本小时累计到 22 > 15，应被拒
        StepVerifier.create(s.process("1.1.1.1", Map.of(), List.of(file("2.txt", 11)), "u2"))
                .consumeErrorWith(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(429, ((ApiException) e).status());
                })
                .verify();
    }

    // ── 入口：handle（解析 + 流式落盘） ──

    @Test
    void handle_streamsFileToDiskAndReturnsMetadata() throws Exception {
        MultipartUploadService s = newService(1024, 1024 * 1024, 60_000);
        byte[] content = "hello stream".getBytes();

        var exchange = exchangeWith(oneFile(content), oneField());

        AtomicReference<String> uploadId = new AtomicReference<>();
        StepVerifier.create(s.handle(exchange))
                .consumeNextWith(summary -> {
                    uploadId.set(summary.uploadId());
                    assertEquals(1, summary.fileCount());
                    assertEquals(content.length, summary.totalBytes());
                    assertEquals("a.txt", summary.files().get(0).filename());
                    assertEquals("text/plain", summary.files().get(0).contentType());
                    assertEquals("hi", summary.fields().get("note"));
                })
                .verifyComplete();

        // 文件确实流式写到了磁盘，且内容无损
        Path dir = tempDir.resolve(uploadId.get());
        try (var files = Files.list(dir)) {
            Path written = files.findFirst().orElseThrow();
            assertArrayEquals(content, Files.readAllBytes(written));
        }
    }

    @Test
    void handle_oversizedFile_returns400() {
        // 单文件上限 10 字节，写入 11 字节
        MultipartUploadService s = newService(10, 1024 * 1024, 60_000);
        byte[] big = "12345678901".getBytes();

        var exchange = exchangeWith(oneFile(big), oneField());

        StepVerifier.create(s.handle(exchange))
                .consumeErrorWith(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(400, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    void handle_emptyParts_returns400() {
        MultipartUploadService s = newService(1024, 1024 * 1024, 60_000);
        var req = mock(ServerHttpRequest.class);
        when(req.getHeaders()).thenReturn(new HttpHeaders());
        var exchange = mock(ServerWebExchange.class);
        when(exchange.getRequest()).thenReturn(req);
        when(exchange.getMultipartData()).thenReturn(Mono.just(new LinkedMultiValueMap<>()));

        StepVerifier.create(s.handle(exchange))
                .consumeErrorWith(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(400, ((ApiException) e).status());
                })
                .verify();
    }

    // ── 到期删除 ──

    @Test
    void uploadFilesAreDeletedAfterTtl() throws Exception {
        MultipartUploadService s = newService(1024, 1024 * 1024, 200);

        var exchange = exchangeWith(oneFile("temp".getBytes()), oneField());
        StepVerifier.create(s.handle(exchange)).expectNextCount(1).verifyComplete();

        Path uploadDir = firstUploadDir();
        assertNotNull(uploadDir);
        assertTrue(Files.exists(uploadDir));

        Thread.sleep(900);
        assertFalse(Files.exists(uploadDir), "超过 TTL 后临时上传目录应被删除");
    }

    // ── 测试辅助 ──

    /** 构造一个 mock FilePart，其 transferTo 会把给定字节真实写入目标文件。 */
    private FilePart oneFile(byte[] content) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.TEXT_PLAIN);
        FilePart fp = mock(FilePart.class);
        when(fp.name()).thenReturn("file");
        when(fp.filename()).thenReturn("a.txt");
        when(fp.headers()).thenReturn(h);
        when(fp.transferTo(any(Path.class))).thenAnswer(inv -> {
            Files.write(inv.getArgument(0, Path.class), content);
            return Mono.empty();
        });
        return fp;
    }

    /** 构造一个 mock FormFieldPart。 */
    private FormFieldPart oneField() {
        FormFieldPart ff = mock(FormFieldPart.class);
        when(ff.name()).thenReturn("note");
        when(ff.value()).thenReturn("hi");
        return ff;
    }

    /** 组装一个带「1 文件 + 1 字段」multipart 数据的 exchange。 */
    private ServerWebExchange exchangeWith(FilePart file, FormFieldPart field) {
        MultiValueMap<String, Part> map = new LinkedMultiValueMap<>();
        map.add("file", file);
        map.add("note", field);

        var req = mock(ServerHttpRequest.class);
        when(req.getHeaders()).thenReturn(new HttpHeaders());
        var exchange = mock(ServerWebExchange.class);
        when(exchange.getRequest()).thenReturn(req);
        when(exchange.getMultipartData()).thenReturn(Mono.just(map));
        return exchange;
    }

    private Path firstUploadDir() {
        try (var stream = Files.list(tempDir)) {
            return stream.filter(Files::isDirectory).findFirst().orElse(null);
        } catch (Exception e) {
            return null;
        }
    }
}