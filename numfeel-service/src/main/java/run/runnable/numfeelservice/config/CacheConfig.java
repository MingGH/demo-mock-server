package run.runnable.numfeelservice.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.cache.interceptor.KeyGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.TimeUnit;

/**
 * 缓存配置：使用 Caffeine 异步模式，原生支持 Mono/Flux 返回类型的 @Cacheable。
 * <p>
 * 全局默认：500 条、5 分钟过期。各业务缓存按名字注册独立策略。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setAsyncCacheMode(true);

        // 全局默认策略
        cacheManager.setCaffeine(Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(5, TimeUnit.MINUTES));

        // 排行榜：1 条、1 小时
        cacheManager.registerCustomCache("leaderboard",
                Caffeine.newBuilder()
                        .maximumSize(1)
                        .expireAfterWrite(1, TimeUnit.HOURS)
                        .buildAsync());

        // 词云：1 条、1 小时
        cacheManager.registerCustomCache("wordCloud",
                Caffeine.newBuilder()
                        .maximumSize(1)
                        .expireAfterWrite(1, TimeUnit.HOURS)
                        .buildAsync());

        // 事件摘要：1000 条、60 秒
        cacheManager.registerCustomCache("eventSummary",
                Caffeine.newBuilder()
                        .maximumSize(1000)
                        .expireAfterWrite(60, TimeUnit.SECONDS)
                        .buildAsync());

        // 键盘节奏统计：200 条、60 秒（最近邻居距离需全量特征比对，缓存避免每次请求重算）
        cacheManager.registerCustomCache("keystrokeStats",
                Caffeine.newBuilder()
                        .maximumSize(200)
                        .expireAfterWrite(60, TimeUnit.SECONDS)
                        .buildAsync());

        // HIBP range 查询：20000 条、6 小时
        cacheManager.registerCustomCache("pwnedRange",
                Caffeine.newBuilder()
                        .maximumSize(20_000)
                        .expireAfterWrite(6, TimeUnit.HOURS)
                        .buildAsync());

        // 知乎创作分析：100 条、15 分钟。key 是 SHA-256(token) 前 16 字节的 hex，
        // 通过 zhihuTokenKeyGenerator 注入，token 明文不会进入缓存键。
        cacheManager.registerCustomCache("zhihuAnalyze",
                Caffeine.newBuilder()
                        .maximumSize(100)
                        .expireAfterWrite(15, TimeUnit.MINUTES)
                        .buildAsync());

        return cacheManager;
    }

    /**
     * 知乎 access token 哈希 key 生成器。
     * <p>
     * 只读方法第一个参数（accessSecret），做 SHA-256 截断后作为缓存 key。
     * 这样明文 token 不会以 cache key 的形式留在堆里。
     */
    @Bean
    public KeyGenerator zhihuTokenKeyGenerator() {
        return (Object target, Method method, Object... params) -> {
            if (params.length == 0 || !(params[0] instanceof String token) || token.isEmpty()) {
                throw new IllegalArgumentException(
                        "zhihuTokenKeyGenerator: first parameter must be a non-empty String token");
            }
            return hashToken(token);
        };
    }

    /**
     * SHA-256(token) 前 16 字节的 16 进制表示。
     * 公开给 Service 用于在强制刷新时 evict 缓存（必须和 KeyGenerator 用同一个函数）。
     *
     * @param token 用户提供的知乎 Access Secret
     * @return "zh:" + 32 位十六进制
     */
    public static String hashToken(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(32);
            for (int i = 0; i < 16; i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return "zh:" + sb;
        } catch (NoSuchAlgorithmException e) {
            // 几乎不可能；fallback 用 identity
            return "zh:" + Integer.toHexString(System.identityHashCode(token));
        }
    }
}
