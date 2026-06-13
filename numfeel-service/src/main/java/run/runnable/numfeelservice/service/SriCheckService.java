package run.runnable.numfeelservice.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SRI（Subresource Integrity）检测服务。
 * <p>
 * 抓取目标 URL 的 HTML，解析所有 script/link 标签，
 * 判断哪些是第三方资源、是否具有 integrity 属性，并评估潜在风险。
 */
@Service
public class SriCheckService {

    private static final Logger log = LoggerFactory.getLogger(SriCheckService.class);
    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(15);

    private final WebClient webClient;

    public SriCheckService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(5 * 1024 * 1024))
                .build();
    }

    /**
     * 检测指定 URL 的 SRI 使用情况。
     */
    public Mono<Map<String, Object>> check(String url) {
        return fetchHtml(url)
                .map(html -> parseResources(url, html))
                .subscribeOn(Schedulers.boundedElastic());
    }

    private Mono<String> fetchHtml(String url) {
        return webClient.get()
                .uri(url)
                .header("User-Agent", "Mozilla/5.0 (compatible; SRI-Checker/1.0)")
                .header("Accept", "text/html,application/xhtml+xml")
                .retrieve()
                .bodyToMono(String.class)
                .timeout(FETCH_TIMEOUT);
    }

    /**
     * 解析 HTML，提取所有 script 和 link[rel=stylesheet] 标签。
     */
    Map<String, Object> parseResources(String targetUrl, String html) {
        Document doc = Jsoup.parse(html, targetUrl);
        String targetHost = extractHost(targetUrl);

        List<Map<String, Object>> resources = new ArrayList<>();

        // 解析 <script src="...">
        Elements scripts = doc.select("script[src]");
        for (Element el : scripts) {
            String src = el.absUrl("src");
            if (src.isEmpty()) continue;
            resources.add(buildResourceInfo("script", src, targetHost, el));
        }

        // 解析 <link rel="stylesheet" href="...">
        Elements links = doc.select("link[rel=stylesheet][href]");
        for (Element el : links) {
            String href = el.absUrl("href");
            if (href.isEmpty()) continue;
            resources.add(buildResourceInfo("link", href, targetHost, el));
        }

        // 构建摘要
        long thirdPartyCount = resources.stream()
                .filter(r -> Boolean.TRUE.equals(r.get("thirdParty"))).count();
        long protectedCount = resources.stream()
                .filter(r -> Boolean.TRUE.equals(r.get("thirdParty")))
                .filter(r -> Boolean.TRUE.equals(r.get("hasSri"))).count();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", resources.size());
        summary.put("thirdParty", (int) thirdPartyCount);
        summary.put("protected", (int) protectedCount);
        summary.put("unprotected", (int) (thirdPartyCount - protectedCount));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("url", targetUrl);
        result.put("resources", resources);
        result.put("summary", summary);
        return result;
    }

    private Map<String, Object> buildResourceInfo(String tag, String src, String targetHost, Element el) {
        String resourceHost = extractHost(src);
        boolean isThirdParty = !resourceHost.isEmpty() && !isSameOrigin(targetHost, resourceHost);
        String integrity = el.attr("integrity");
        boolean hasSri = !integrity.isEmpty();
        String crossorigin = el.attr("crossorigin");

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("tag", tag);
        info.put("src", src);
        info.put("thirdParty", isThirdParty);
        info.put("hasSri", hasSri);
        info.put("integrity", hasSri ? integrity : null);
        info.put("crossorigin", crossorigin.isEmpty() ? null : crossorigin);

        if (isThirdParty && !hasSri) {
            info.put("risks", assessRisks(tag));
        } else {
            info.put("risks", List.of());
        }

        return info;
    }

    /**
     * 根据资源类型评估潜在攻击风险。
     */
    static List<String> assessRisks(String tag) {
        if ("script".equals(tag)) {
            return List.of("键盘记录", "Cookie/Token 窃取", "页面重定向", "挖矿脚本注入", "表单数据劫持");
        } else {
            return List.of("页面内容覆盖", "钓鱼界面注入", "点击劫持辅助");
        }
    }

    /**
     * 提取主机名（含端口）。
     */
    static String extractHost(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            return host == null ? "" : host.toLowerCase();
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * 判断是否同源（比较根域名）。
     */
    static boolean isSameOrigin(String host1, String host2) {
        return getRootDomain(host1).equals(getRootDomain(host2));
    }

    /**
     * 提取根域名（取最后两段，如 cdn.example.com → example.com）。
     */
    static String getRootDomain(String host) {
        if (host == null || host.isEmpty()) return "";
        String[] parts = host.split("\\.");
        if (parts.length <= 2) return host;
        return parts[parts.length - 2] + "." + parts[parts.length - 1];
    }
}
