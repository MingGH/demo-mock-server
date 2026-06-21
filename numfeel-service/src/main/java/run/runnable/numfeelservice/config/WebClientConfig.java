package run.runnable.numfeelservice.config;

import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.ssl.util.InsecureTrustManagerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

/**
 * 反应式 WebClient 配置。
 * <p>
 * 旧版 Vert.x 用 {@code setTrustAll(true)} 访问 {@code api.996.ninja}，这里保持等价行为
 * （仅用于对上游统计接口的代理调用）。
 */
@Configuration
public class WebClientConfig {

    @Value("${ninja.api.base-url:https://api.996.ninja}")
    private String ninjaApiBaseUrl;

    @Value("${umami.base-url:https://umami.runnable.run}")
    private String umamiBaseUrl;

    /** 访问 api.996.ninja 的客户端（信任全部证书，带超时）。 */
    @Bean
    public WebClient ninjaApiWebClient() {
        return buildTrustAllClient().baseUrl(ninjaApiBaseUrl).build();
    }

    /** 访问 Umami 统计后台的客户端（信任全部证书，带超时）。 */
    @Bean
    public WebClient umamiWebClient() {
        return buildTrustAllClient().baseUrl(umamiBaseUrl).build();
    }

    private WebClient.Builder buildTrustAllClient() {
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(30))
                .secure(spec -> {
                    try {
                        spec.sslContext(SslContextBuilder.forClient()
                                .trustManager(InsecureTrustManagerFactory.INSTANCE)
                                .build());
                    } catch (Exception e) {
                        throw new IllegalStateException("Failed to build SSL context", e);
                    }
                });
        return WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient));
    }
}
