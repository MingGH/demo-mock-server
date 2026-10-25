package run.runnable.numfeelservice.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 启动时检查 Loki 配置，缺失时只告警，不阻断业务启动。
 */
@Slf4j
@Component
public class LokiConfigCheck implements ApplicationRunner {

    private final String url;
    private final String token;

    public LokiConfigCheck(
            @Value("${loki.url:}") String url,
            @Value("${loki.token:}") String token) {
        this.url = url;
        this.token = token;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (url == null || url.isBlank() || token == null || token.isBlank()) {
            log.warn("Loki 日志未配置（loki.url/loki.token 为空），仅输出到控制台");
        }
    }
}
