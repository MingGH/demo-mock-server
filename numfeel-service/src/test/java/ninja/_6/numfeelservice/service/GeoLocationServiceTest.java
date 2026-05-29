package ninja._6.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GeoLocationService 单元测试：不加载真实 GeoIP 数据库时的降级行为（reader == null）。
 * 迁移自旧版同名测试。
 */
class GeoLocationServiceTest {

    private GeoLocationService service;

    @BeforeEach
    void setup() {
        service = new GeoLocationService(); // 不调用 init()，reader 保持 null
    }

    @Test
    void lookupShouldReturnUnknownWhenReaderIsNull() {
        ObjectNode result = service.lookup("8.8.8.8");
        assertEquals("Unknown", result.get("country").asText());
    }

    @Test
    void lookupShouldReturnUnknownForInvalidIp() {
        ObjectNode result = service.lookup("not-an-ip");
        assertEquals("Unknown", result.get("country").asText());
    }

    @Test
    void lookupShouldReturnUnknownForNullIp() {
        ObjectNode result = service.lookup(null);
        assertEquals("Unknown", result.get("country").asText());
    }

    @Test
    void lookupResultShouldAlwaysHaveCountryField() {
        String[] ips = {"1.2.3.4", "255.255.255.255", "0.0.0.0", "invalid"};
        for (String ip : ips) {
            ObjectNode result = service.lookup(ip);
            assertTrue(result.has("country"),
                    "Result for IP " + ip + " should always contain 'country' field");
        }
    }
}
