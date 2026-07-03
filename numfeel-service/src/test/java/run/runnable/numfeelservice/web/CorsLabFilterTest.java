package run.runnable.numfeelservice.web;

import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.service.CorsDemoService;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * {@link CorsLabFilter#corsHeadersFor} 纯函数单测。
 * 覆盖三种策略在「真正请求 / 预检请求」下的头部产出，与前端 {@code engine.js} 的 {@code serverHeaders} 对齐。
 */
class CorsLabFilterTest {

    private static final String ORIGIN = "https://numfeel.996.ninja";

    @Test
    void deny_returnsNoHeadersForActualRequest() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_DENY, ORIGIN, false);
        assertTrue(h.isEmpty());
    }

    @Test
    void deny_returnsNoHeadersForPreflightEither() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_DENY, ORIGIN, true);
        assertTrue(h.isEmpty());
    }

    @Test
    void allow_usesWildcardForActualRequest() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_ALLOW, ORIGIN, false);
        assertEquals("*", h.get("Access-Control-Allow-Origin"));
        // allow 模式不带凭据头——这正是 credentials:include 时浏览器会拒绝的关键
        assertNull(h.get("Access-Control-Allow-Credentials"));
        // 真正请求不需要 Allow-Methods/Headers/Max-Age
        assertNull(h.get("Access-Control-Allow-Methods"));
    }

    @Test
    void allow_preflightAddsMethodsHeadersMaxAge() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_ALLOW, ORIGIN, true);
        assertEquals("*", h.get("Access-Control-Allow-Origin"));
        assertNotNull(h.get("Access-Control-Allow-Methods"));
        assertTrue(h.get("Access-Control-Allow-Methods").contains("GET"));
        assertTrue(h.get("Access-Control-Allow-Headers").contains("X-Demo"));
        assertEquals("3600", h.get("Access-Control-Max-Age"));
    }

    @Test
    void allowCredentials_echoesOriginInsteadOfWildcard() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_ALLOW_CREDENTIALS, ORIGIN, false);
        // 带凭据时禁止用 *，必须回显具体 Origin
        assertEquals(ORIGIN, h.get("Access-Control-Allow-Origin"));
        assertEquals("true", h.get("Access-Control-Allow-Credentials"));
        assertEquals("Origin", h.get("Vary"));
    }

    @Test
    void allowCredentials_preflightAlsoEchoesOrigin() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_ALLOW_CREDENTIALS, ORIGIN, true);
        assertEquals(ORIGIN, h.get("Access-Control-Allow-Origin"));
        assertEquals("true", h.get("Access-Control-Allow-Credentials"));
        assertNotNull(h.get("Access-Control-Allow-Methods"));
    }

    @Test
    void allowCredentials_nullOriginFallsBackToLiteralNull() {
        Map<String, String> h = CorsLabFilter.corsHeadersFor(CorsDemoService.MODE_ALLOW_CREDENTIALS, null, false);
        assertEquals("null", h.get("Access-Control-Allow-Origin"));
    }
}
