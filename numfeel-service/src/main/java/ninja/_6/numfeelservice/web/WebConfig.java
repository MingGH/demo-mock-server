package ninja._6.numfeelservice.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.ResourceHandlerRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

import java.io.File;

/**
 * WebFlux 配置：CORS 与静态资源。
 * <p>
 * 旧版 Vert.x 用 {@code CorsHandler.create("*")} 放开全部来源，并用 StaticHandler
 * 暴露 {@code pages/} 与 {@code components/}（基于工作目录的相对路径）。
 * 这里用文件系统路径还原同样的对外路径与目录布局，避免把 8MB 前端资源打进 jar。
 * 静态目录位置可通过 {@code static.pages-location} / {@code static.components-location} 配置；
 * 目录不存在时（如纯 API 部署，前端单独托管在 numfeel.996.ninja）自动跳过静态映射。
 */
@Configuration
public class WebConfig implements WebFluxConfigurer {

    @Value("${static.pages-location:file:../pages/}")
    private String pagesLocation;

    @Value("${static.components-location:file:../components/}")
    private String componentsLocation;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization", "Accept", "Origin")
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (locationExists(pagesLocation)) {
            registry.addResourceHandler("/pages/**").addResourceLocations(pagesLocation);
        }
        if (locationExists(componentsLocation)) {
            registry.addResourceHandler("/components/**").addResourceLocations(componentsLocation);
        }
    }

    /** 仅对 file: 前缀的本地目录做存在性检查；classpath 等其他形式一律注册。 */
    private boolean locationExists(String location) {
        if (location == null) {
            return false;
        }
        if (location.startsWith("file:")) {
            return new File(location.substring("file:".length())).isDirectory();
        }
        return true;
    }
}
