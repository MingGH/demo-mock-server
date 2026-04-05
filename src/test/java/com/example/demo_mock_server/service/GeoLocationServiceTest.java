package com.example.demo_mock_server.service;

import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * GeoLocationService 单元测试
 * 不依赖真实 GeoIP 数据库（reader 为 null 时的降级行为）
 */
class GeoLocationServiceTest {

    private GeoLocationService service;

    @BeforeEach
    void setup() {
        // 不调用 init()，reader 保持 null，测试降级逻辑
        service = new GeoLocationService();
    }

    @Test
    void lookupShouldReturnUnknownWhenReaderIsNull() {
        JsonObject result = service.lookup("8.8.8.8");
        assertEquals("Unknown", result.getString("country"));
    }

    @Test
    void lookupShouldReturnUnknownForInvalidIp() {
        JsonObject result = service.lookup("not-an-ip");
        assertEquals("Unknown", result.getString("country"));
    }

    @Test
    void lookupShouldReturnUnknownForNullIp() {
        JsonObject result = service.lookup(null);
        assertEquals("Unknown", result.getString("country"));
    }

    @Test
    void lookupShouldReturnUnknownForLocalhostWhenNoDb() {
        JsonObject result = service.lookup("127.0.0.1");
        assertEquals("Unknown", result.getString("country"));
    }

    @Test
    void lookupResultShouldAlwaysHaveCountryField() {
        String[] ips = {"1.2.3.4", "255.255.255.255", "0.0.0.0", "invalid"};
        for (String ip : ips) {
            JsonObject result = service.lookup(ip);
            assertTrue(result.containsKey("country"),
                "Result for IP " + ip + " should always contain 'country' field");
        }
    }
}
