package com.example.demo_mock_server.service;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import com.maxmind.geoip2.record.Country;
import com.maxmind.geoip2.record.Location;
import io.vertx.core.json.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URL;
import java.nio.file.*;

/**
 * IP 地理位置查询服务
 */
public class GeoLocationService {

    private static final Logger log = LoggerFactory.getLogger(GeoLocationService.class);

    private static final String CITY_DB_URL    = "https://fileshare.runnable.run/GeoLite2/GeoLite2-City.mmdb";
    private static final String COUNTRY_DB_URL = "https://fileshare.runnable.run/GeoLite2/GeoLite2-Country.mmdb";
    private static final String DATA_DIR       = "data/GeoLite2";

    private DatabaseReader reader;
    private boolean isCityDb = false;

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

    private void loadDatabase() {
        try {
            File cityFile = new File(DATA_DIR, "GeoLite2-City.mmdb");
            if (cityFile.exists()) {
                reader = new DatabaseReader.Builder(cityFile).build();
                isCityDb = true;
                log.info("GeoIP City database loaded");
                return;
            }
            File countryFile = new File(DATA_DIR, "GeoLite2-Country.mmdb");
            if (countryFile.exists()) {
                reader = new DatabaseReader.Builder(countryFile).build();
                log.info("GeoIP Country database loaded");
            } else {
                log.warn("GeoIP database not found in {}, geolocation disabled", DATA_DIR);
            }
        } catch (Exception e) {
            log.error("Failed to load GeoIP database: {}", e.getMessage(), e);
        }
    }

    /**
     * 查询 IP 地理位置，返回 { country, countryCode, lat?, lng?, city? }
     */
    public JsonObject lookup(String ipAddress) {
        JsonObject result = new JsonObject();
        if (reader == null) return result.put("country", "Unknown");
        try {
            InetAddress ip = InetAddress.getByName(ipAddress);
            if (isCityDb) {
                CityResponse resp = reader.city(ip);
                Country country = resp.getCountry();
                if (country != null && country.getName() != null) {
                    result.put("country", country.getName())
                          .put("countryCode", country.getIsoCode());
                }
                Location loc = resp.getLocation();
                if (loc != null) {
                    if (loc.getLatitude() != null)  result.put("lat", loc.getLatitude());
                    if (loc.getLongitude() != null) result.put("lng", loc.getLongitude());
                }
                if (resp.getCity() != null && resp.getCity().getName() != null) {
                    result.put("city", resp.getCity().getName());
                }
            } else {
                var resp = reader.country(ip);
                Country country = resp.getCountry();
                if (country != null && country.getName() != null) {
                    result.put("country", country.getName())
                          .put("countryCode", country.getIsoCode());
                }
            }
        } catch (Exception ignored) {
            // 查不到地理位置不影响主流程
        }
        return result.containsKey("country") ? result : result.put("country", "Unknown");
    }
}
