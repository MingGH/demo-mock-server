package run.runnable.numfeelservice.service;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.GZIPInputStream;

/**
 * GeoIP 查询服务 — 基于 DB-IP Lite IP-to-City 免费数据库。
 * <p>
 * 数据库文件路径：{@code data/GeoLite2/GeoLite2-City.mmdb}。
 * 启动时若文件不存在，自动从 db-ip.com 下载当月免费版（无需 API key）。
 * 下载失败则 GeoIP 功能降级不可用。
 */
@Service
public class GeoIpService {

    private static final Logger log = LoggerFactory.getLogger(GeoIpService.class);
    private static final String DB_PATH = "data/GeoLite2/GeoLite2-City.mmdb";
    private static final String DOWNLOAD_URL_PREFIX =
            "https://download.db-ip.com/free/dbip-city-lite-";
    private static final DateTimeFormatter YM_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

    private volatile DatabaseReader reader;
    private final AtomicBoolean downloading = new AtomicBoolean(false);

    @PostConstruct
    void init() {
        File dbFile = new File(DB_PATH);
        if (dbFile.exists()) {
            try {
                loadReader(dbFile);
            } catch (IOException e) {
                log.error("Failed to load GeoLite2 database: {}", e.getMessage());
            }
        } else {
            log.warn("GeoLite2 database not found at {}, attempting download...", DB_PATH);
            tryDownload();
        }
    }

    private void tryDownload() {
        if (!downloading.compareAndSet(false, true)) {
            return;
        }
        Mono.fromCallable(this::executeDownload)
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        file -> {
                            try {
                                loadReader(file);
                            } catch (Exception e) {
                                downloading.set(false);
                                log.error("Failed to load downloaded GeoLite2 database: {}", e.getMessage());
                            }
                        },
                        err -> {
                            downloading.set(false);
                            log.error("Failed to download GeoLite2 database: {}", err.getMessage());
                        }
                );
    }

    private File executeDownload() throws Exception {
        String ym = YearMonth.now().format(YM_FMT);
        String url = DOWNLOAD_URL_PREFIX + ym + ".mmdb.gz";
        File tmpDir = Files.createTempDirectory("geolite2-dl").toFile();
        File gzFile = new File(tmpDir, "dbip-city-lite.mmdb.gz");
        try {
            log.info("Downloading DB-IP City Lite {}...", ym);
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(120_000);
            conn.setInstanceFollowRedirects(true);
            int status = conn.getResponseCode();
            if (status != 200) {
                String body = "";
                try (InputStream errStream = conn.getErrorStream()) {
                    if (errStream != null) body = new String(errStream.readAllBytes());
                }
                throw new IOException("DB-IP download returned HTTP " + status + ": " + body);
            }
            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(gzFile)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
            } finally {
                conn.disconnect();
            }

            log.info("Decompressing DB-IP City Lite...");
            File targetFile = new File(DB_PATH);
            targetFile.getParentFile().mkdirs();
            try (GZIPInputStream gzIn = new GZIPInputStream(Files.newInputStream(gzFile.toPath()));
                 FileOutputStream out = new FileOutputStream(targetFile)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = gzIn.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
            }
            log.info("DB-IP City Lite database saved to {}", targetFile.getAbsolutePath());
            return targetFile;
        } finally {
            deleteRecursively(tmpDir);
        }
    }

    private void loadReader(File dbFile) throws IOException {
        reader = new DatabaseReader.Builder(dbFile).build();
        log.info("GeoLite2-City database loaded: {}", dbFile.getAbsolutePath());
    }

    private void deleteRecursively(File dir) {
        try {
            Files.walk(dir.toPath())
                    .sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
        } catch (IOException ignored) {}
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
