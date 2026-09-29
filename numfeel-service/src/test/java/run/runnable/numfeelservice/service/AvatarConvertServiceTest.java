package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;
import run.runnable.numfeelservice.web.ApiException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AvatarConvertService 测试。真实转换用例依赖本机 gif2webp，不存在时跳过。
 */
class AvatarConvertServiceTest {

    /** 内嵌一张 24x24、2 帧的测试 gif（避免测试再依赖别的工具生成输入）。 */
    private static final String TINY_GIF_BASE64 =
            "R0lGODlhGAAYAPcfMQAAACQAAEgAAGwAAJAAALQAANgAAPwAAAAkACQkAEgkAGwkAJAkALQkANgkAPwkAABIACRIAEhIAGxIAJBIALRIANhIAPxIAABsACRsAEhsAGxsAJBsALRsANhsAPxsAACQACSQAEiQAGyQAJCQALSQANiQAPyQAAC0ACS0AEi0AGy0AJC0ALS0ANi0APy0AADYACTYAEjYAGzYAJDYALTYANjYAPzYAAD8ACT8AEj8AGz8AJD8ALT8ANj8APz8AAAAVSQAVUgAVWwAVZAAVbQAVdgAVfwAVQAkVSQkVUgkVWwkVZAkVbQkVdgkVfwkVQBIVSRIVUhIVWxIVZBIVbRIVdhIVfxIVQBsVSRsVUhsVWxsVZBsVbRsVdhsVfxsVQCQVSSQVUiQVWyQVZCQVbSQVdiQVfyQVQC0VSS0VUi0VWy0VZC0VbS0Vdi0Vfy0VQDYVSTYVUjYVWzYVZDYVbTYVdjYVfzYVQD8VST8VUj8VWz8VZD8VbT8Vdj8Vfz8VQAAqiQAqkgAqmwAqpAAqrQAqtgAqvwAqgAkqiQkqkgkqmwkqpAkqrQkqtgkqvwkqgBIqiRIqkhIqmxIqpBIqrRIqthIqvxIqgBsqiRsqkhsqmxsqpBsqrRsqthsqvxsqgCQqiSQqkiQqmyQqpCQqrSQqtiQqvyQqgC0qiS0qki0qmy0qpC0qrS0qti0qvy0qgDYqiTYqkjYqmzYqpDYqrTYqtjYqvzYqgD8qiT8qkj8qmz8qpD8qrT8qtj8qvz8qgAA/yQA/0gA/2wA/5AA/7QA/9gA//wA/wAk/yQk/0gk/2wk/5Ak/7Qk/9gk//wk/wBI/yRI/0hI/2xI/5BI/7RI/9hI//xI/wBs/yRs/0hs/2xs/5Bs/7Rs/9hs//xs/wCQ/ySQ/0iQ/2yQ/5CQ/7SQ/9iQ//yQ/wC0/yS0/0i0/2y0/5C0/7S0/9i0//y0/wDY/yTY/0jY/2zY/5DY/7TY/9jY//zY/wD8/yT8/0j8/2z8/5D8/7T8/9j8//z8/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQEMgAfACwAAAAAGAAYAAAI/wAJDSM2sOCPgz+AKQR26JhDfBDxFSRIEWHChQ4fRiQYIEjHjhJCSgAAhKQAISchQFE5EEgQl0GCJJAwE4hNl0KCCEEChSdHj0BphiRpMkjKlVBavgzgcmZNki4F6EQCweewjlJPeDFhRoKCjia8aD3KkljMAKW8DFhwoswEAGkHDDjRaQBPngcOCBBw4gMECBIinBj8oejgqgrK5A0g4MMJBBBmOnZs06hjnonz7u2b2ATbyQJKmZnrF6mBA4wdK3DTZcLkEwHMqL3cE4pmvn4BJ+jb13DpCEkWN34cWcLrysOpJmBzOwIZzwzMlPhayoSAAV7MCFEZgZRwBBFMnGjwcELB2wBixV7nmSDCbQiQAUcYWhKI1JRUbaMWABmyUwk3RTVVbe/9BZhIRNmH0nam7ddfcTXdpNOAeOklAHx/CTVSffcxqNJ3GP5Xn4A7VaXfXgYeGFiCJ0ml0ocOhihUgBPuVFtAAAAh+QQFMgAAACwAAAAACgAKAAAIOQAPCDyAoyAOAAAGEjSIUCDChwACBDFwACJCIEEcWpSoESLGjg9PeAGJUMBDiQglogSA8WIQIAECAgA7";

    private static final String GIF2WEBP = resolveBinary();

    private final AvatarConvertService service = new AvatarConvertService(GIF2WEBP);

    private static String resolveBinary() {
        String env = System.getenv("NUMFEEL_GIF2WEBP_PATH");
        return env != null && !env.isBlank() ? env : "gif2webp";
    }

    private static boolean available() {
        try {
            return new ProcessBuilder(GIF2WEBP, "-version")
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start()
                    .waitFor(10, TimeUnit.SECONDS);
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    private static byte[] tinyGif() {
        return Base64.getDecoder().decode(TINY_GIF_BASE64.getBytes(StandardCharsets.US_ASCII));
    }

    @Test
    void convert_real_gif_returns_animated_webp() {
        Assumptions.assumeTrue(available(), "本机无 gif2webp，跳过真实转换");

        StepVerifier.create(service.gifToAnimatedWebp(tinyGif()))
                .assertNext(webp -> {
                    assertTrue(webp.length > 12, "webp 体积异常");
                    assertEquals('R', webp[0]);
                    assertEquals('I', webp[1]);
                    assertEquals('F', webp[2]);
                    assertEquals('F', webp[3]);
                    assertEquals('W', webp[8]);
                    assertEquals('E', webp[9]);
                    assertEquals('B', webp[10]);
                    assertEquals('P', webp[11]);
                    // 必须保留动画：产物里应含 ANMF 动画帧块，否则又是静态图
                    assertTrue(contains(webp, "ANMF"), "产物没有动画帧，等于又转成了静态图");
                })
                .verifyComplete();
    }

    @Test
    void convert_non_gif_returns_400() {
        StepVerifier.create(service.gifToAnimatedWebp("not a gif".getBytes(StandardCharsets.US_ASCII)))
                .expectErrorSatisfies(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(400, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    void convert_empty_body_returns_400() {
        StepVerifier.create(service.gifToAnimatedWebp(new byte[0]))
                .expectErrorSatisfies(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(400, ((ApiException) e).status());
                })
                .verify();
    }

    @Test
    void missing_binary_returns_503() {
        var broken = new AvatarConvertService("/nonexistent/gif2webp-does-not-exist");

        StepVerifier.create(broken.gifToAnimatedWebp(tinyGif()))
                .expectErrorSatisfies(e -> {
                    assertTrue(e instanceof ApiException);
                    assertEquals(503, ((ApiException) e).status());
                })
                .verify();
    }

    /** 判断字节流里是否出现某段 ASCII 标记（如 RIFF 容器里的 ANMF 块）。 */
    private static boolean contains(byte[] data, String marker) {
        byte[] needle = marker.getBytes(StandardCharsets.US_ASCII);
        outer:
        for (int i = 0; i + needle.length <= data.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (data[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return true;
        }
        return false;
    }
}
