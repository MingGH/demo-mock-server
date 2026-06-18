package run.runnable.numfeelservice.benchmark;

import at.favre.lib.crypto.bcrypt.BCrypt;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * 密码哈希算法性能基准测试。
 * 用实际数据证明：慢哈希（bcrypt/PBKDF2）单次耗时 vs 快哈希（MD5/SHA-256）的差距。
 *
 * 运行：./mvnw test -Dtest=HashBenchmarkTest -pl .
 */
class HashBenchmarkTest {

    private static final String PASSWORD = "Pa55w0rd!";
    private static final int WARMUP = 3;
    private static final int RUNS = 10;

    @Test
    void benchmarkAllHashAlgorithms() throws Exception {
        System.out.println("=== 密码哈希性能基准测试 ===");
        System.out.println("密码: " + PASSWORD);
        System.out.println("每种算法运行 " + RUNS + " 次取平均（预热 " + WARMUP + " 次）\n");

        benchmarkMd5();
        benchmarkSha256();
        benchmarkBcrypt(10);
        benchmarkBcrypt(12);
        benchmarkBcrypt(14);
        benchmarkPbkdf2(100_000);
        benchmarkPbkdf2(600_000);

        System.out.println("\n=== 结论 ===");
        System.out.println("MD5/SHA-256: 微秒级（百万分之一秒）");
        System.out.println("bcrypt cost=10: 约 60-100ms");
        System.out.println("bcrypt cost=12: 约 200-400ms");
        System.out.println("PBKDF2 600K iterations: 约 200-500ms");
        System.out.println("慢哈希比快哈希慢 5~6 个数量级，这是设计目标。");
    }

    private void benchmarkMd5() throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] input = PASSWORD.getBytes();

        // warmup
        for (int i = 0; i < 10_000; i++) md.digest(input);

        long start = System.nanoTime();
        int iterations = 1_000_000;
        for (int i = 0; i < iterations; i++) {
            md.digest(input);
        }
        long totalNs = System.nanoTime() - start;
        long avgNs = totalNs / iterations;

        System.out.printf("MD5          : %,d ns/次 (%.4f ms/次) — %,d 次/秒%n",
                avgNs, avgNs / 1_000_000.0, 1_000_000_000L / avgNs);
    }

    private void benchmarkSha256() throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        byte[] input = PASSWORD.getBytes();

        // warmup
        for (int i = 0; i < 10_000; i++) sha.digest(input);

        long start = System.nanoTime();
        int iterations = 1_000_000;
        for (int i = 0; i < iterations; i++) {
            sha.digest(input);
        }
        long totalNs = System.nanoTime() - start;
        long avgNs = totalNs / iterations;

        System.out.printf("SHA-256      : %,d ns/次 (%.4f ms/次) — %,d 次/秒%n",
                avgNs, avgNs / 1_000_000.0, 1_000_000_000L / avgNs);
    }

    private void benchmarkBcrypt(int cost) {
        byte[] password = PASSWORD.getBytes();

        // warmup
        for (int i = 0; i < WARMUP; i++) {
            BCrypt.withDefaults().hash(cost, password);
        }

        long total = 0;
        for (int i = 0; i < RUNS; i++) {
            long start = System.nanoTime();
            BCrypt.withDefaults().hash(cost, password);
            total += (System.nanoTime() - start);
        }
        long avgMs = total / RUNS / 1_000_000;

        System.out.printf("bcrypt(cost=%d): %,d ms/次 — %.1f 次/秒%n",
                cost, avgMs, 1000.0 / avgMs);
    }

    private void benchmarkPbkdf2(int iterations) throws Exception {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");

        // warmup
        for (int i = 0; i < WARMUP; i++) {
            PBEKeySpec spec = new PBEKeySpec(PASSWORD.toCharArray(), salt, iterations, 256);
            factory.generateSecret(spec);
        }

        long total = 0;
        for (int i = 0; i < RUNS; i++) {
            PBEKeySpec spec = new PBEKeySpec(PASSWORD.toCharArray(), salt, iterations, 256);
            long start = System.nanoTime();
            factory.generateSecret(spec);
            total += (System.nanoTime() - start);
        }
        long avgMs = total / RUNS / 1_000_000;

        System.out.printf("PBKDF2(%,d): %,d ms/次 — %.1f 次/秒%n",
                iterations, avgMs, 1000.0 / avgMs);
    }
}
