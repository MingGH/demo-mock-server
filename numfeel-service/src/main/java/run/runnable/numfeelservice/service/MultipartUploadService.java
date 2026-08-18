package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.http.codec.multipart.FormFieldPart;
import org.springframework.http.codec.multipart.Part;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import run.runnable.numfeelservice.controller.dto.UploadResponses.UploadFile;
import run.runnable.numfeelservice.controller.dto.UploadResponses.UploadSummary;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ClientIp;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * multipart/form-data 上传演示服务。
 * <p>
 * 通过真实的 {@code POST /api/multipart/upload} 演示"multipart 是打包协议"这一观点：
 * <ul>
 *   <li>一次请求可携带多个文件 + 多个普通表单字段，按 boundary 逐个解包</li>
 *   <li>文件流式写入磁盘（{@link FilePart#transferTo(Path)}），不整块读进内存</li>
 *   <li>单个文件上限 {@code maxFileBytes}（默认 10MB），超限返回 400</li>
 *   <li>每个 IP 每小时上传总量上限 {@code maxHourlyBytes}（默认 1GB，Buck4j 计数），超限返回 429</li>
 *   <li>落盘的临时文件在 {@code expirationMs}（默认 5 分钟）后由后台调度任务自动删除</li>
 * </ul>
 */
@Slf4j
@Service
public class MultipartUploadService {

    /** 单文件上限（字节）。 */
    private final long maxFileBytes;

    /** 每 IP 每小时上传总量上限（字节）。 */
    private final long maxHourlyBytes;

    /** 上传根目录。 */
    private final Path root;

    /** 临时文件删除延迟。 */
    private final Duration expiration;

    /** 每 IP 的小时级 token bucket（token 单位为字节），用于 1GB/小时/IP 限流。 */
    private final Cache<String, Bucket> buckets;

    /** 后台定时清理过期上传目录的调度器。 */
    private final ScheduledExecutorService cleanup;

    /**
     * 构造服务（Spring 注入参数；单元测试也可直接传入显式值）。
     *
     * @param root           上传根目录（不存在会自动创建）
     * @param maxFileBytes   单文件字节上限
     * @param maxHourlyBytes 每 IP 每小时总字节上限
     * @param expirationMs   临时文件保留毫秒数
     */
    public MultipartUploadService(
            @Value("${numfeel.upload.dir:${java.io.tmpdir}/numfeel-upload}") String root,
            @Value("${numfeel.upload.max-file-bytes:10485760}") long maxFileBytes,
            @Value("${numfeel.upload.max-hourly-bytes:1073741824}") long maxHourlyBytes,
            @Value("${numfeel.upload.expiration-ms:300000}") long expirationMs) {
        this.maxFileBytes = maxFileBytes;
        this.maxHourlyBytes = maxHourlyBytes;
        this.root = Path.of(root);
        this.expiration = Duration.ofMillis(Math.max(1, expirationMs));
        this.buckets = Caffeine.newBuilder()
                .expireAfterAccess(Duration.ofHours(6))
                .maximumSize(50_000)
                .build();
        this.cleanup = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "numfeel-upload-cleanup");
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * WebFlux 入口：从请求解析 multipart body，流式落盘，校验配额后返回汇总。
     *
     * @param exchange 当前交换对象（含请求与 multipart 数据）
     * @return 解析汇总结果
     */
    public Mono<UploadSummary> handle(ServerWebExchange exchange) {
        String ip = ClientIp.resolve(exchange.getRequest());
        return exchange.getMultipartData()
                .flatMap(parts -> handleParts(ip, parts));
    }

    /**
     * 把 {@code MultiValueMap<String, Part>} 拆成普通字段 + 文件列表，再流式落盘。
     * <p>
     * 注意：这里只收集 part 的元数据（字段值很小、文件只持有文件名/类型等头信息），
     * 文件字节由 {@link #writeToDisk(String, List)} 用 {@link FilePart#transferTo(Path)}
     * 直接流式写入磁盘，不会整块堆进内存。
     *
     * @param ip    客户端 IP
     * @param parts multipart 解析出的所有 part
     */
    private Mono<UploadSummary> handleParts(String ip, MultiValueMap<String, Part> parts) {
        Map<String, String> fields = new LinkedHashMap<>();
        List<FilePart> files = new ArrayList<>();

        for (Map.Entry<String, List<Part>> entry : parts.entrySet()) {
            for (Part part : entry.getValue()) {
                if (part instanceof FilePart fp) {
                    files.add(fp);
                } else if (part instanceof FormFieldPart ff) {
                    fields.put(part.name(), ff.value());
                }
                // 其他类型 part（如普通 raw part）按非文件/非字段忽略。
            }
        }

        if (files.isEmpty() && fields.isEmpty()) {
            return Mono.error(new ApiException(400, "请求中没有上传内容"));
        }

        String uploadId = newUploadId();
        return writeToDisk(uploadId, files)
                .flatMap(uploaded -> process(ip, fields, uploaded, uploadId));
    }

    /**
     * 把文件列表流式写入磁盘（顺序写），返回每个文件的元数据。
     *
     * @param uploadId 本次上传的临时目录标识
     * @param files    待落盘的文件 part 列表
     */
    private Mono<List<UploadFile>> writeToDisk(String uploadId, List<FilePart> files) {
        if (files.isEmpty()) {
            return Mono.just(List.of());
        }
        Path dir = root.resolve(uploadId);
        return Mono.fromCallable(() -> {
            Files.createDirectories(dir);
            return dir;
        })
                .subscribeOn(Schedulers.boundedElastic())
                .thenMany(Flux.fromIterable(files).index())
                .concatMap(t -> writeOneFile(dir, t.getT2(), t.getT1()))
                .collectList();
    }

    /**
     * 把单个文件流式写入磁盘，写完后校验大小（超限删除并返回 400）。
     *
     * @param dir   目标目录
     * @param file  待写入的文件 part
     * @param index 文件序号（用于落盘文件名去重）
     */
    private Mono<UploadFile> writeOneFile(Path dir, FilePart file, long index) {
        Path target = dir.resolve("file-" + index + "-" + sanitizeFilename(file.filename()));
        return file.transferTo(target)
                .then(Mono.fromCallable(() -> {
                    long size = Files.size(target);
                    if (size > maxFileBytes) {
                        Files.deleteIfExists(target);
                        throw new ApiException(400, "单个文件不能超过 " + formatBytes(maxFileBytes));
                    }
                    return new UploadFile(file.name(), file.filename(), contentTypeOf(file), size);
                }).subscribeOn(Schedulers.boundedElastic()));
    }

    /**
     * 核心处理：校验小时配额 → 调度到时删除 → 返回汇总。
     * 只依赖内存数据（文件元数据），不碰文件内容，便于单元测试。
     *
     * @param ip       客户端 IP
     * @param fields   普通表单字段
     * @param files    已落盘的文件元数据
     * @param uploadId 本次上传的临时目录标识
     */
    public Mono<UploadSummary> process(String ip, Map<String, String> fields,
                                       List<UploadFile> files, String uploadId) {
        long totalBytes = 0;
        for (UploadFile f : files) {
            totalBytes += f.size();
        }

        if (!bucketOf(ip).tryConsume(totalBytes)) {
            return deleteUpload(uploadId)
                    .then(Mono.error(new ApiException(429,
                            "该 IP 每小时上传量已达上限 " + formatBytes(maxHourlyBytes) + "，请稍后再试")));
        }

        scheduleDeletion(uploadId);
        return Mono.just(new UploadSummary(uploadId, files.size(), totalBytes,
                expiration.toSeconds(), fields, files));
    }

    /** 删除一次上传的整个目录（用于配额超限时回滚）。 */
    private Mono<Void> deleteUpload(String uploadId) {
        return Mono.fromRunnable(() -> deleteRecursively(root.resolve(uploadId)))
                .subscribeOn(Schedulers.boundedElastic())
                .then();
    }

    /** 在指定延迟后递归删除该上传目录。 */
    private void scheduleDeletion(String uploadId) {
        Path dir = root.resolve(uploadId);
        cleanup.schedule(() -> deleteRecursively(dir), expiration.toMillis(), TimeUnit.MILLISECONDS);
    }

    /** 递归删除目录（后台线程执行，不阻塞事件循环）。 */
    private void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.deleteIfExists(d);
                    return FileVisitResult.CONTINUE;
                }
            });
            log.info("已清理上传目录: {}", dir);
        } catch (IOException e) {
            log.warn("清理上传目录失败 {}: {}", dir, e.getMessage());
        }
    }

    /** 获取（必要时创建）某 IP 的小时级字节配额桶。 */
    private Bucket bucketOf(String ip) {
        return buckets.get(ip, k -> Bucket.builder()
                .addLimit(Bandwidth.simple(maxHourlyBytes, Duration.ofHours(1)))
                .build());
    }

    /** 生成一次上传的短 id。 */
    private static String newUploadId() {
        return Long.toHexString(Instant.now().toEpochMilli())
                + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    /** 从文件 part 头取 Content-Type。 */
    private static String contentTypeOf(FilePart filePart) {
        var mediaType = filePart.headers().getContentType();
        return mediaType != null ? mediaType.toString() : null;
    }

    /** 清理文件名中的路径敏感字符，防止目录穿越。 */
    private static String sanitizeFilename(String name) {
        if (name == null || name.isBlank()) {
            return "unnamed";
        }
        return name.replaceAll("[^A-Za-z0-9._-]+", "_");
    }

    /** 字节数转为人类可读格式，用于错误信息。 */
    private static String formatBytes(long bytes) {
        if (bytes >= 1024 * 1024 * 1024) {
            return (bytes / (1024.0 * 1024 * 1024)) + "GB";
        }
        if (bytes >= 1024 * 1024) {
            return (bytes / (1024.0 * 1024)) + "MB";
        }
        return bytes + "B";
    }

    /** 关闭后台调度器（Spring 关闭时调用；测试可直接手动调用）。 */
    @PreDestroy
    public void shutdown() {
        cleanup.shutdownNow();
    }
}