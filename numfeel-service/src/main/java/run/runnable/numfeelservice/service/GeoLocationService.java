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
import java.util.concurrent.Executors;

/**
 * IP 地理位置查询服务。
 * 启动后异步下载并加载 GeoLite2 数据库。
 */
@Service
public class GeoLocationService {

    private static final Logger log = LoggerFactory.getLogger(GeoLocationService.class);

    private static final String CITY_DB_URL = "https://fileshare.runnable.run/GeoLite2/GeoLite2-City.mmdb";
    private static final String COUNTRY_DB_URL = "https://fileshare.runnable.run/GeoLite2/GeoLite2-Country.mmdb";
    private static final String DATA_DIR = "data/GeoLite2";

    private volatile DatabaseReader reader;
    private volatile boolean isCityDb;

    @EventListener(ApplicationReadyEvent.class)
    public void initOnStartup() {
        Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "geoip-init");
            t.setDaemon(true);
            return t;
        }).submit(() -> {
            try {
                init();
            } catch (Exception e) {
                log.warn("GeoIP init failed (geolocation disabled): {}", e.getMessage());
            }
        });
    }

    /** 确保本地数据库目录存在，按需下载并加载。 */
    public void init() throws Exception {
        Path dir = Paths.get(DATA_DIR);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
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

    private void loadDatabase() {
        try {
            if (tryLoadCityDatabase() || tryLoadCountryDatabase()) {
                return;
            }
            log.warn("GeoIP database not found in {}, geolocation disabled", DATA_DIR);
        } catch (Exception e) {
            log.error("Failed to load GeoIP database: {}", e.getMessage(), e);
        }
    }

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

    private boolean tryLoadCountryDatabase() throws IOException {
        File countryFile = new File(DATA_DIR, "GeoLite2-Country.mmdb");
        if (!countryFile.exists()) {
            return false;
        }
        reader = new DatabaseReader.Builder(countryFile).build();
        isCityDb = false;
        log.info("GeoIP Country database loaded");
        return true;
    }

    /** 查询 IP 地理位置（同步阻塞，调用方需在 boundedElastic 上执行）。 */
    public GeoLocationResponse lookup(String ipAddress) {
        if (reader == null) {
            return new GeoLocationResponse("Unknown", null, null, null, null);
        }
        try {
            InetAddress ip = InetAddress.getByName(ipAddress);
            if (isCityDb) {
                return lookupCity(ip);
            }
            return lookupCountry(ip);
        } catch (Exception e) {
            log.debug("GeoIP lookup failed for {}: {}", ipAddress, e.getMessage());
            return new GeoLocationResponse("Unknown", null, null, null, null);
        }
    }

    private GeoLocationResponse lookupCity(InetAddress ip) throws Exception {
        CityResponse response = reader.city(ip);
        Country country = response.getCountry();
        Location location = response.getLocation();
        return new GeoLocationResponse(
                country != null && country.getName() != null ? country.getName() : "Unknown",
                country != null ? country.getIsoCode() : null,
                location != null ? location.getLatitude() : null,
                location != null ? location.getLongitude() : null,
                response.getCity() != null ? response.getCity().getName() : null
        );
    }

    private GeoLocationResponse lookupCountry(InetAddress ip) throws Exception {
        var response = reader.country(ip);
        Country country = response.getCountry();
        return new GeoLocationResponse(
                country != null && country.getName() != null ? country.getName() : "Unknown",
                country != null ? country.getIsoCode() : null,
                null, null, null
        );
    }
}
