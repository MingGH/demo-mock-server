package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.web.ApiException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

/**
 * 「知乎动态头像注入器」格式转换服务。
 * <p>
 * 知乎会把 gif 转成静态图，动态头像只能用动态 webp，故 gif → 动态 webp 的转换
 * 收敛到服务端：调用 libwebp 自带的 {@code gif2webp} 命令行工具（体积仅数 MB，
 * 比整套 ffmpeg 轻得多），临时文件用完即删。gif2webp 会自动沿用源 gif 的循环次数。
 */
@Service
public class AvatarConvertService {

    private static final Logger log = LoggerFactory.getLogger(AvatarConvertService.class);

    /** 单文件上限：gif 普遍数 MB，20MB 对头像场景绰绰有余。 */
    private static final int MAX_INPUT_BYTES = 20 * 1024 * 1024;

    /** 转换进程超时秒数。 */
    private static final long CONVERT_TIMEOUT_SECONDS = 60;

    private final String gif2webpPath;

    public AvatarConvertService(@Value("${numfeel.gif2webp.path:gif2webp}") String gif2webpPath) {
        this.gif2webpPath = gif2webpPath;
    }

    /**
     * 把动态 gif 转成动态 webp。
     * <p>
     * gif2webp 是阻塞子进程，整体挂到 boundedElastic，不占用事件循环线程。
     *
     * @param gifBytes gif 原始字节
     * @return 动态 webp 字节
     */
    public Mono<byte[]> gifToAnimatedWebp(byte[] gifBytes) {
        return Mono.fromCallable(() -> doConvert(gifBytes))
                .subscribeOn(Schedulers.boundedElastic());
    }

    private byte[] doConvert(byte[] gifBytes) throws IOException, InterruptedException {
        validate(gifBytes);
        Path dir = Files.createTempDirectory("gif2webp");
        try {
            Path input = dir.resolve("input.gif");
            Path output = dir.resolve("output.webp");
            Path errLog = dir.resolve("convert.log");
            Files.write(input, gifBytes);

            // 注意参数顺序：gif2webp [options] <input> -o <output>
            Process proc = startConvert(input, output, errLog);

            if (!proc.waitFor(CONVERT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                log.warn("gif2webp 转换超时，输入 {} 字节", gifBytes.length);
                throw new ApiException(504, "转换超时，换一张小一点的图");
            }
            if (proc.exitValue() != 0) {
                log.warn("gif2webp 退出码 {}: {}", proc.exitValue(), readTail(errLog));
                throw new ApiException(422, "gif 解析失败，文件可能损坏");
            }

            byte[] webp = Files.readAllBytes(output);
            if (webp.length < 12
                    || webp[0] != 'R' || webp[1] != 'I' || webp[2] != 'F' || webp[3] != 'F'
                    || webp[8] != 'W' || webp[9] != 'E' || webp[10] != 'B' || webp[11] != 'P') {
                log.warn("gif2webp 产物缺少 RIFF/WEBP 头，{} 字节", webp.length);
                throw new ApiException(500, "转换产物异常");
            }
            return webp;
        } finally {
            cleanup(dir);
        }
    }

    /**
     * 拉起 gif2webp 子进程。
     * <p>
     * 可执行文件不存在时 {@link ProcessBuilder#start()} 抛 {@link IOException}，
     * 这属于部署缺依赖而非 gif 本身有问题，单独映射成 503 提示。
     */
    private Process startConvert(Path input, Path output, Path errLog) {
        try {
            return new ProcessBuilder(
                    gif2webpPath, "-lossy", "-q", "75",
                    input.toString(), "-o", output.toString())
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(errLog.toFile())
                    .start();
        } catch (IOException e) {
            log.error("无法启动 gif2webp({}): {}", gif2webpPath, e.getMessage());
            throw new ApiException(503, "服务器缺少转换组件，请改用在线工具转 webp");
        }
    }

    private static void validate(byte[] gifBytes) {
        if (gifBytes == null || gifBytes.length == 0) {
            throw ApiException.badRequest("请求体为空");
        }
        if (gifBytes.length > MAX_INPUT_BYTES) {
            throw new ApiException(413, "gif 超过 20MB，请先压缩再试");
        }
        if (gifBytes.length < 6 || gifBytes[0] != 'G' || gifBytes[1] != 'I' || gifBytes[2] != 'F') {
            throw ApiException.badRequest("只接受 gif 文件");
        }
    }

    private static String readTail(Path errLog) {
        try {
            String text = Files.readString(errLog);
            return text.length() <= 300 ? text : text.substring(text.length() - 300);
        } catch (IOException e) {
            return "读取转换日志失败: " + e.getMessage();
        }
    }

    private static void cleanup(Path dir) {
        try (var stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.warn("清理临时文件失败: {}", e.getMessage());
                }
            });
        } catch (IOException e) {
            log.warn("清理临时目录失败: {}", e.getMessage());
        }
    }
}
