package run.runnable.numfeelservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * JS 二进制在线编译服务。
 *
 * <p>使用系统安装的 qjsc（QuickJS Compiler）将预设的 JS 场景编译为独立可执行二进制文件。
 * 编译过程通过 {@link ProgressCallback} 实时推送进度。</p>
 */
@Service
@Slf4j
public class JsBinaryLabService {

    /**
     * 编译进度回调接口。
     */
    @FunctionalInterface
    public interface ProgressCallback {
        /**
         * 推送编译进度。
         *
         * @param stage   编译阶段名
         * @param percent 完成百分比（0-100）
         * @param message 进度描述或日志行
         */
        void onProgress(String stage, int percent, String message);
    }

    /**
     * 预设 JS 场景映射。
     * <ul>
     *   <li>fib — 计算 fib(35) 并 console.log 输出</li>
     *   <li>sort — 生成 10000 个随机数排序并计时</li>
     *   <li>strings — 字符串重复/分割/合并操作</li>
     * </ul>
     */
    static final Map<String, String> SCENARIOS = Map.of(
            "fib", """
                    function fib(n) {
                        if (n <= 1) return n;
                        return fib(n - 1) + fib(n - 2);
                    }
                    var start = Date.now();
                    var result = fib(35);
                    var elapsed = Date.now() - start;
                    console.log("fib(35) = " + result);
                    console.log("Elapsed: " + elapsed + " ms");
                    """,
            "sort", """
                    var arr = [];
                    var N = 10000;
                    var a = 1664525, c = 1013904223, m = Math.pow(2, 32);
                    var seed = 42;
                    for (var i = 0; i < N; i++) {
                        seed = (a * seed + c) % m;
                        arr.push(seed);
                    }
                    var start = Date.now();
                    arr.sort(function(x, y) { return x - y; });
                    var elapsed = Date.now() - start;
                    console.log("Sorted " + N + " numbers in " + elapsed + " ms");
                    console.log("First: " + arr[0] + ", Last: " + arr[arr.length - 1]);
                    """,
            "strings", """
                    var start = Date.now();
                    var base = "HelloQuickJS";
                    var repeated = base.repeat(500);
                    var parts = repeated.split("Q");
                    var joined = parts.join("--");
                    var elapsed = Date.now() - start;
                    console.log("String length: " + joined.length);
                    console.log("Parts: " + parts.length);
                    console.log("Elapsed: " + elapsed + " ms");
                    """
    );

    /**
     * 编译预设场景 JS 为独立可执行二进制文件。
     *
     * @param scenario        场景名（fib / sort / strings）
     * @param progressCallback 进度回调，不得为 null
     * @return 编译产物路径的 Mono，编译失败时以 error 信号结束
     */
    public Mono<Path> compile(String scenario, ProgressCallback progressCallback) {
        return Mono.fromCallable(() -> {
            // 1. 校验场景
            var js = SCENARIOS.get(scenario);
            if (js == null) {
                throw new IllegalArgumentException("未知的编译场景: " + scenario);
            }

            // 2. 创建临时目录，写入 input.js
            progressCallback.onProgress("prepare", 0, "创建临时编译目录");
            var tmpDir = Files.createTempDirectory("jsbin-");
            var inputFile = tmpDir.resolve("input.js");
            Files.writeString(inputFile, js, StandardCharsets.UTF_8);
            var outputFile = tmpDir.resolve("output");
            progressCallback.onProgress("prepare", 5, "JS 源码已写入 " + inputFile);

            // 3. 执行 qjsc
            progressCallback.onProgress("compiling", 10, "启动 qjsc 编译…");
            var pb = new ProcessBuilder("qjsc", "-o", "output", "input.js");
            pb.directory(tmpDir.toFile());
            pb.redirectErrorStream(true);
            var process = pb.start();

            // 4. 流式读取 stdout/stderr
            try (var reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                int progress = 15;
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.isBlank()) {
                        progress = Math.min(90, progress + 3);
                        progressCallback.onProgress("compiling", progress, line);
                    }
                }
            }

            // 5. 等待完成（30s 超时）
            var finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("编译超时（30s），已强制终止 qjsc");
            }
            var exitCode = process.exitValue();
            if (exitCode != 0) {
                throw new RuntimeException("qjsc 退出码非零: " + exitCode);
            }

            // 6. 校验产物
            if (!Files.exists(outputFile) || Files.size(outputFile) == 0) {
                throw new RuntimeException("编译产物缺失或为空: " + outputFile);
            }
            progressCallback.onProgress("complete", 100,
                    "编译完成，产物大小: " + Files.size(outputFile) + " bytes");

            return outputFile;
        }).subscribeOn(Schedulers.boundedElastic());
    }
}
