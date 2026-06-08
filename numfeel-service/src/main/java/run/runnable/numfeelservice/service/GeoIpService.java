package run.runnable.numfeelservice.service;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.File;
import java.io.IOException;
import java.net.InetAddress;

/**
 * GeoIP 查询服务 — 基于 MaxMind GeoLite2-City 数据库。
 * <p>
 * 数据库文件路径：{@code data/GeoLite2/GeoLite2-City.mmdb}（运行时下载，不入库）。
 * 如果数据库文件不存在，所有查询返回 null（降级处理）。
 */
@Service
public class GeoIpService {

    private static final Logger log = LoggerFactory.getLogger(GeoIpService.class);
    private static final String DB_PATH = "data/GeoLite2/GeoLite2-City.mmdb";

    private DatabaseReader reader;

    @PostConstruct
    void init() {
        File dbFile = new File(DB_PATH);
        if (!dbFile.exists()) {
            log.warn("GeoLite2 database not found at {}, GeoIP lookup will be disabled", DB_PATH);
            return;
        }
        try {
            reader = new DatabaseReader.Builder(dbFile).build();
            log.info("GeoLite2-City database loaded: {}", dbFile.getAbsolutePath());
        } catch (IOException e) {
            log.error("Failed to load GeoLite2 database: {}", e.getMessage());
        }
    }

    @PreDestroy
    void destroy() {
        if (reader != null) {
            try {
                reader.close();
            } catch (IOException ignored) {}
        }
    }

    /**
     * 查询 IP 的地理位置。
     *
     * @param ip IPv4 地址字符串
     * @return 地理信息，如果数据库不可用或 IP 未找到则返回 null
     */
    public GeoResult lookup(String ip) {
        if (reader == null || ip == null || ip.isBlank()) return null;
        try {
            InetAddress addr = InetAddress.getByName(ip);
            CityResponse resp = reader.city(addr);
            String country = resp.getCountry().getName();
            String countryCode = resp.getCountry().getIsoCode();
            String city = resp.getCity().getName();
            Double lat = resp.getLocation().getLatitude();
            Double lng = resp.getLocation().getLongitude();
            return new GeoResult(country, countryCode, city, lat, lng);
        } catch (Exception e) {
            // IP 未找到或格式错误，静默返回 null
            return null;
        }
    }

    /** 数据库是否可用。 */
    public boolean isAvailable() {
        return reader != null;
    }

    /** GeoIP 查询结果。 */
    public record GeoResult(String country, String countryCode, String city, Double lat, Double lng) {}
}
