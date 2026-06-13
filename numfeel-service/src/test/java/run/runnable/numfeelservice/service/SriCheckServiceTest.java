package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SriCheckServiceTest {

    private SriCheckService service;

    @BeforeEach
    void setUp() {
        // 使用默认 WebClient.Builder 构建（测试中不实际发请求）
        service = new SriCheckService(org.springframework.web.reactive.function.client.WebClient.builder());
    }

    @Test
    void parseResources_detectsThirdPartyScriptWithoutSri() {
        String html = """
                <html>
                <head>
                  <script src="https://cdn.example.com/lib.js"></script>
                </head>
                <body></body>
                </html>
                """;

        Map<String, Object> result = service.parseResources("https://mysite.com/page", html);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> resources = (List<Map<String, Object>>) result.get("resources");
        assertEquals(1, resources.size());

        Map<String, Object> res = resources.get(0);
        assertEquals("script", res.get("tag"));
        assertTrue((Boolean) res.get("thirdParty"));
        assertFalse((Boolean) res.get("hasSri"));
        assertNull(res.get("integrity"));

        @SuppressWarnings("unchecked")
        List<String> risks = (List<String>) res.get("risks");
        assertFalse(risks.isEmpty());
        assertTrue(risks.contains("键盘记录"));
    }

    @Test
    void parseResources_detectsScriptWithSri() {
        String html = """
                <html>
                <head>
                  <script src="https://cdn.example.com/lib.js"
                          integrity="sha384-abc123"
                          crossorigin="anonymous"></script>
                </head>
                <body></body>
                </html>
                """;

        Map<String, Object> result = service.parseResources("https://mysite.com/page", html);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> resources = (List<Map<String, Object>>) result.get("resources");
        assertEquals(1, resources.size());

        Map<String, Object> res = resources.get(0);
        assertTrue((Boolean) res.get("hasSri"));
        assertEquals("sha384-abc123", res.get("integrity"));
        assertEquals("anonymous", res.get("crossorigin"));

        @SuppressWarnings("unchecked")
        List<String> risks = (List<String>) res.get("risks");
        assertTrue(risks.isEmpty());
    }

    @Test
    void parseResources_firstPartyScriptNotMarkedAsThirdParty() {
        String html = """
                <html>
                <head>
                  <script src="https://mysite.com/app.js"></script>
                  <script src="/local.js"></script>
                </head>
                <body></body>
                </html>
                """;

        Map<String, Object> result = service.parseResources("https://mysite.com/page", html);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> resources = (List<Map<String, Object>>) result.get("resources");
        // 第一个是同域，第二个是相对路径（解析为同域）
        for (Map<String, Object> res : resources) {
            assertFalse((Boolean) res.get("thirdParty"));
        }
    }

    @Test
    void parseResources_detectsStylesheetLink() {
        String html = """
                <html>
                <head>
                  <link rel="stylesheet" href="https://cdn.other.com/style.css">
                </head>
                <body></body>
                </html>
                """;

        Map<String, Object> result = service.parseResources("https://mysite.com/page", html);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> resources = (List<Map<String, Object>>) result.get("resources");
        assertEquals(1, resources.size());

        Map<String, Object> res = resources.get(0);
        assertEquals("link", res.get("tag"));
        assertTrue((Boolean) res.get("thirdParty"));
        assertFalse((Boolean) res.get("hasSri"));

        @SuppressWarnings("unchecked")
        List<String> risks = (List<String>) res.get("risks");
        assertTrue(risks.contains("钓鱼界面注入"));
    }

    @Test
    void parseResources_summaryIsCorrect() {
        String html = """
                <html>
                <head>
                  <script src="https://cdn.a.com/a.js"></script>
                  <script src="https://cdn.b.com/b.js" integrity="sha256-xyz"></script>
                  <script src="/local.js"></script>
                  <link rel="stylesheet" href="https://cdn.c.com/c.css">
                </head>
                <body></body>
                </html>
                """;

        Map<String, Object> result = service.parseResources("https://mysite.com/page", html);

        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        assertEquals(4, summary.get("total"));
        assertEquals(3, summary.get("thirdParty"));
        assertEquals(1, summary.get("protected"));
        assertEquals(2, summary.get("unprotected"));
    }

    @Test
    void extractHost_handlesVariousFormats() {
        assertEquals("example.com", SriCheckService.extractHost("https://example.com/path"));
        assertEquals("cdn.example.com", SriCheckService.extractHost("https://cdn.example.com/lib.js"));
        assertEquals("", SriCheckService.extractHost("not-a-url"));
    }

    @Test
    void getRootDomain_extractsCorrectly() {
        assertEquals("example.com", SriCheckService.getRootDomain("cdn.example.com"));
        assertEquals("example.com", SriCheckService.getRootDomain("a.b.example.com"));
        assertEquals("example.com", SriCheckService.getRootDomain("example.com"));
        assertEquals("localhost", SriCheckService.getRootDomain("localhost"));
    }

    @Test
    void isSameOrigin_subdomainsAreSameOrigin() {
        assertTrue(SriCheckService.isSameOrigin("www.example.com", "cdn.example.com"));
        assertTrue(SriCheckService.isSameOrigin("example.com", "api.example.com"));
        assertFalse(SriCheckService.isSameOrigin("example.com", "other.com"));
    }

    @Test
    void assessRisks_scriptHasMoreRisks() {
        List<String> scriptRisks = SriCheckService.assessRisks("script");
        List<String> linkRisks = SriCheckService.assessRisks("link");
        assertTrue(scriptRisks.size() > linkRisks.size());
        assertTrue(scriptRisks.contains("Cookie/Token 窃取"));
        assertTrue(linkRisks.contains("钓鱼界面注入"));
    }
}
