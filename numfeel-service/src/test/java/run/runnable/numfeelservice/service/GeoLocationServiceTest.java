package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.GeoLocationResponse;

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
        GeoLocationResponse result = service.lookup("8.8.8.8");
        assertEquals("Unknown", result.country());
    }

    @Test
    void lookupShouldReturnUnknownForInvalidIp() {
        GeoLocationResponse result = service.lookup("not-an-ip");
        assertEquals("Unknown", result.country());
    }

    @Test
    void lookupShouldReturnUnknownForNullIp() {
        GeoLocationResponse result = service.lookup(null);
        assertEquals("Unknown", result.country());
    }

    @Test
    void lookupResultShouldAlwaysHaveCountryField() {
        String[] ips = {"1.2.3.4", "255.255.255.255", "0.0.0.0", "invalid"};
        for (String ip : ips) {
            GeoLocationResponse result = service.lookup(ip);
            assertTrue(result.country() != null && !result.country().isEmpty(),
                    "Result for IP " + ip + " should always contain country information");
        }
    }
}
