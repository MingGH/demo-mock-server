package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.GeoLocationResponse;
import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import com.maxmind.geoip2.record.Country;
import com.maxmind.geoip2.record.Location;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * IP 地理位置查询服务（迁移自 Vert.x 版）。
 * <p>
 * 启动后在后台线程下载并加载 GeoLite2 数据库（best-effort，失败不阻断服务）。
 * {@code lookup} 为同步阻塞调用，调用方需在 boundedElastic 调度器上执行。
 */
@Service
public class GeoLocationService {

    private static final Logger log = LoggerFactory.getLogger(GeoLocationService.class);

    private static final String CITY_DB_URL = "https://fileshare.runnable.run/GeoLite2/GeoLite2-City.mmdb";
    private static final String COUNTRY_DB_URL = "https://fileshare.runnable.run/GeoLite2/GeoLite2-Country.mmdb";
    private static final String DATA_DIR = "data/GeoLite2";

    private volatile DatabaseReader reader;
    private volatile boolean isCityDb = false;

    @EventListener(ApplicationReadyEvent.class)
    public void initOnStartup() {
        startBackgroundInit();
    }

    /** 在后台守护线程中初始化 GeoIP，避免阻塞主线程启动。 */
    private void startBackgroundInit() {
        Thread thread = new Thread(() -> {
            try {
                init();
            } catch (Exception e) {
                log.warn("GeoIP init failed (geolocation disabled): {}", e.getMessage());
            }
        }, "geoip-init");
        thread.setDaemon(true);
        thread.start();
    }

    /** 确保本地数据库目录存在，并按需下载后加载 GeoIP 数据库。 */
    public void init() throws Exception {
        Path dir = Paths.get(DATA_DIR);
        if (!Files.exists(dir)) Files.createDirectories(dir);
        downloadIfMissing(dir.resolve("GeoLite2-City.mmdb"), CITY_DB_URL);
        downloadIfMissing(dir.resolve("GeoLite2-Country.mmdb"), COUNTRY_DB_URL);
        loadDatabase();
    }

    private void downloadIfMissing(Path path, String url) throws IOException {
        if (!Files.exists(path)) {
            log.info("Downloading {} from {}...", path.getFileName(), url);
            try (InputStream in = new URL(url).openStream()) {
                Files.copy(in, path, StandardCopyOption.REPLACE_EXISTING);
            }
            log.info("Downloaded {}", path.getFileName());
        }
    }

    /** 优先加载 City 库，若不存在再回退到 Country 库。 */
    private void loadDatabase() {
        try {
            if (tryLoadCityDatabase()) {
                return;
            }
            if (tryLoadCountryDatabase()) {
                log.info("GeoIP Country database loaded");
            } else {
                log.warn("GeoIP database not found in {}, geolocation disabled", DATA_DIR);
            }
        } catch (Exception e) {
            log.error("Failed to load GeoIP database: {}", e.getMessage(), e);
        }
    }

    /** 尝试加载包含经纬度与城市信息的 City 数据库。 */
    private boolean tryLoadCityDatabase() throws IOException {
        File cityFile = new File(DATA_DIR, "GeoLite2-City.mmdb");
        if (!cityFile.exists()) {
            return false;
        }
        reader = new DatabaseReader.Builder(cityFile).build();
        isCityDb = true;
        log.info("GeoIP City database loaded");
        return true;
    }

    /** 加载仅包含国家级信息的 Country 数据库。 */
    private boolean tryLoadCountryDatabase() throws IOException {
        File countryFile = new File(DATA_DIR, "GeoLite2-Country.mmdb");
        if (!countryFile.exists()) {
            return false;
        }
        reader = new DatabaseReader.Builder(countryFile).build();
        isCityDb = false;
        return true;
    }

    /** 查询 IP 地理位置。 */
    public GeoLocationResponse lookup(String ipAddress) {
        if (reader == null) {
            return new GeoLocationResponse("Unknown", null, null, null, null);
        }

        String countryName = "Unknown";
        String countryCode = null;
        Double lat = null;
        Double lng = null;
        String city = null;
        try {
            InetAddress ip = InetAddress.getByName(ipAddress);
            if (isCityDb) {
                GeoLocationResponse response = lookupCity(ip);
                countryName = response.country();
                countryCode = response.countryCode();
                lat = response.lat();
                lng = response.lng();
                city = response.city();
            } else {
                GeoLocationResponse response = lookupCountry(ip);
                countryName = response.country();
                countryCode = response.countryCode();
            }
        } catch (Exception ignored) {
            // 查不到地理位置不影响主流程
        }
        return new GeoLocationResponse(countryName, countryCode, lat, lng, city);
    }

    /** 使用 City 库查询国家、城市和经纬度信息。 */
    private GeoLocationResponse lookupCity(InetAddress ip) throws Exception {
        CityResponse response = reader.city(ip);
        Country country = response.getCountry();
        String countryName = country != null && country.getName() != null ? country.getName() : "Unknown";
        String countryCode = country != null ? country.getIsoCode() : null;
        Location location = response.getLocation();
        Double lat = location != null ? location.getLatitude() : null;
        Double lng = location != null ? location.getLongitude() : null;
        String city = response.getCity() != null ? response.getCity().getName() : null;
        return new GeoLocationResponse(countryName, countryCode, lat, lng, city);
    }

    /** 使用 Country 库查询国家级信息。 */
    private GeoLocationResponse lookupCountry(InetAddress ip) throws Exception {
        var response = reader.country(ip);
        Country country = response.getCountry();
        String countryName = country != null && country.getName() != null ? country.getName() : "Unknown";
        String countryCode = country != null ? country.getIsoCode() : null;
        return new GeoLocationResponse(countryName, countryCode, null, null, null);
    }
}
