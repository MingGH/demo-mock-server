package run.runnable.numfeelservice.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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

        // HIBP range 查询：20000 条、6 小时
        cacheManager.registerCustomCache("pwnedRange",
                Caffeine.newBuilder()
                        .maximumSize(20_000)
                        .expireAfterWrite(6, TimeUnit.HOURS)
                        .buildAsync());

        return cacheManager;
    }
}
