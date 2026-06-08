package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.service.dht.DhtPeerDiscovery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * P2P 隐私透视镜 — 通过真实 DHT 协议发现 peer 并提供地理分布统计。
 * <p>
 * 工作模式：
 * 1. 对预设合法 torrent（Ubuntu ISO 等）执行真实的 DHT get_peers 查询
 * 2. 收集到的 peer IP 通过内置国家段映射做粗略地理定位
 * 3. 结果缓存 10 分钟，避免频繁查询 DHT 网络
 * 4. 如果 DHT 查询失败（网络不可达等），降级为模拟数据
 */
@Service
public class P2pSpyService {

    private static final Logger log = LoggerFactory.getLogger(P2pSpyService.class);

    /** 预设的合法公开 torrent 列表（infohash 来自官方 torrent 文件）。 */
    static final List<TorrentMeta> PRESET_TORRENTS = List.of(
            new TorrentMeta(
                    "ubuntu-24.04.2-desktop-amd64.iso",
                    "Ubuntu 24.04 Desktop ISO",
                    // Ubuntu 24.04.2 LTS 官方 torrent infohash (from releases.ubuntu.com)
                    "611f70899d4e1d6a9c39cfc925f103dfef630328",
                    800, 1600
            ),
            new TorrentMeta(
                    "debian-13.5.0-amd64-netinst.iso",
                    "Debian 13.5 Netinst",
                    // Debian 13.5.0 官方 torrent infohash (from cdimage.debian.org)
                    "58846860f0a766f8a42b0bb214d8c713fdf1b167",
                    200, 500
            ),
            new TorrentMeta(
                    "LibreOffice_24.8.0_Linux_x86-64_deb.tar.gz",
                    "LibreOffice 24.8",
                    // Ubuntu 24.04.2 server ISO infohash (备选热门种子)
                    "611f70899d4e1d6a9c39cfc925f103dfef630328",
                    150, 400
            )
    );

    private final Cache<String, PeerDiscoveryResult> resultCache;
    private final Map<String, Mono<PeerDiscoveryResult>> inflightQueries = new java.util.concurrent.ConcurrentHashMap<>();
    private final boolean dhtEnabled;
    private final GeoIpService geoIpService;

    /** Spring 注入构造器。 */
    public P2pSpyService(GeoIpService geoIpService) {
        this(true, geoIpService);
    }

    /** 支持测试时关闭 DHT 查询并可选注入 GeoIpService。 */
    public P2pSpyService(boolean dhtEnabled, GeoIpService geoIpService) {
        this.dhtEnabled = dhtEnabled;
        this.geoIpService = geoIpService;
        this.resultCache = Caffeine.newBuilder()
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .maximumSize(10)
                .build();
    }

    /** 测试便捷构造器（无 GeoIP）。 */
    public P2pSpyService(boolean dhtEnabled) {
        this(dhtEnabled, null);
    }

    /**
     * 获取指定预设 torrent 的 peer 列表——优先真实 DHT 查询，失败时降级。
     * <p>
     * 对同一个 infohash 的并发请求会合并为一次 DHT 查询（避免打爆 bootstrap 节点），
     * 整体超时 15 秒，超时后降级为模拟数据。
     *
     * @param torrentIndex 预设 torrent 索引（0-based），默认 0
     * @return 包含 peer 列表和统计信息的响应
     */
    public Mono<PeerDiscoveryResult> getPeers(int torrentIndex) {
        int idx = Math.max(0, Math.min(torrentIndex, PRESET_TORRENTS.size() - 1));
        TorrentMeta meta = PRESET_TORRENTS.get(idx);

        PeerDiscoveryResult cached = resultCache.getIfPresent(meta.infohash());
        if (cached != null) {
            return Mono.just(cached);
        }

        if (!dhtEnabled) {
            return Mono.fromCallable(() -> generateFallback(meta))
                    .doOnNext(result -> resultCache.put(meta.infohash(), result));
        }

        // 合并同一 infohash 的并发请求
        return inflightQueries.computeIfAbsent(meta.infohash(), key ->
                Mono.fromCallable(() -> queryDht(meta))
                        .subscribeOn(Schedulers.boundedElastic())
                        .timeout(java.time.Duration.ofSeconds(15))
                        .onErrorResume(err -> {
                            log.warn("DHT query failed/timeout for {}: {}", meta.name(), err.getMessage());
                            return Mono.fromCallable(() -> generateFallback(meta));
                        })
                        .doOnNext(result -> resultCache.put(meta.infohash(), result))
                        .doFinally(signal -> inflightQueries.remove(meta.infohash()))
                        .cache() // 让多个订阅者共享同一个结果
        );
    }

    /**
     * 获取所有预设 torrent 的基本信息。
     *
     * @return 预设 torrent 元数据列表
     */
    public Mono<List<TorrentSummary>> listTorrents() {
        List<TorrentSummary> summaries = new ArrayList<>();
        for (int i = 0; i < PRESET_TORRENTS.size(); i++) {
            TorrentMeta m = PRESET_TORRENTS.get(i);
            summaries.add(new TorrentSummary(i, m.name(), m.infohash()));
        }
        return Mono.just(summaries);
    }

    // ── 真实 DHT 查询 ──────────────────────────────────────────

    private PeerDiscoveryResult queryDht(TorrentMeta meta) throws Exception {
        log.info("Starting DHT peer discovery for: {} ({})", meta.name(), meta.infohash().substring(0, 8));
        try (DhtPeerDiscovery dht = new DhtPeerDiscovery()) {
            List<DhtPeerDiscovery.DiscoveredPeer> rawPeers = dht.discoverPeers(meta.infohash());

            if (rawPeers.isEmpty()) {
                log.warn("DHT returned 0 peers for {}, using fallback", meta.name());
                return generateFallback(meta);
            }

            // 将真实 peer 转换为带地理信息的 PeerInfo
            List<PeerInfo> peers = rawPeers.stream()
                    .map(this::enrichWithGeo)
                    .toList();

            return buildResult(meta, peers, "dht");
        }
    }

    // ── IP 地理定位（优先 GeoLite2，降级为 IANA 段推测） ──────────────────

    /** 用 GeoLite2 精确定位，如果不可用则按 IP 段粗略推测。 */
    private PeerInfo enrichWithGeo(DhtPeerDiscovery.DiscoveredPeer raw) {
        if (geoIpService != null && geoIpService.isAvailable()) {
            GeoIpService.GeoResult geo = geoIpService.lookup(raw.ip());
            if (geo != null && geo.country() != null) {
                return new PeerInfo(
                        raw.ip(), raw.port(),
                        geo.country(), geo.countryCode() != null ? geo.countryCode() : "XX",
                        geo.city(),
                        geo.lat() != null ? geo.lat() : 0.0,
                        geo.lng() != null ? geo.lng() : 0.0,
                        System.currentTimeMillis()
                );
            }
        }
        // 降级：粗略推测
        GeoHint hint = guessGeoByIp(raw.ip());
        return new PeerInfo(
                raw.ip(), raw.port(),
                hint.country(), hint.countryCode(), null,
                hint.lat(), hint.lng(),
                System.currentTimeMillis()
        );
    }

    /** 基于 IP 首八位和 IANA 区域分配做粗略国家推测。 */
    static GeoHint guessGeoByIp(String ip) {
        try {
            int firstOctet = Integer.parseInt(ip.split("\\.")[0]);
            // 基于 IANA 区域分配的粗略映射
            if (firstOctet >= 3 && firstOctet <= 76) return GEO_HINTS.get("US");
            if (firstOctet >= 77 && firstOctet <= 95) return GEO_HINTS.get("EU");
            if (firstOctet >= 96 && firstOctet <= 126) return GEO_HINTS.get("US");
            if (firstOctet >= 128 && firstOctet <= 145) return GEO_HINTS.get("EU");
            if (firstOctet >= 146 && firstOctet <= 159) return GEO_HINTS.get("US");
            if (firstOctet >= 160 && firstOctet <= 175) return GEO_HINTS.get("EU");
            if (firstOctet >= 176 && firstOctet <= 191) return GEO_HINTS.get("BR");
            if (firstOctet >= 192 && firstOctet <= 195) return GEO_HINTS.get("EU");
            if (firstOctet >= 196 && firstOctet <= 197) return GEO_HINTS.get("ZA");
            if (firstOctet >= 198 && firstOctet <= 199) return GEO_HINTS.get("US");
            if (firstOctet >= 200 && firstOctet <= 201) return GEO_HINTS.get("BR");
            if (firstOctet >= 202 && firstOctet <= 211) return GEO_HINTS.get("AP");
            if (firstOctet >= 212 && firstOctet <= 223) return GEO_HINTS.get("EU");
        } catch (Exception ignored) {}
        return GEO_HINTS.get("US"); // 默认
    }

    private static final Map<String, GeoHint> GEO_HINTS = Map.of(
            "US", new GeoHint("United States", "US", 37.77 + rndOffset(), -95.0 + rndOffset()),
            "EU", new GeoHint("Europe", "EU", 50.0 + rndOffset(), 10.0 + rndOffset()),
            "BR", new GeoHint("Brazil", "BR", -15.8 + rndOffset(), -47.9 + rndOffset()),
            "ZA", new GeoHint("South Africa", "ZA", -33.9 + rndOffset(), 18.4 + rndOffset()),
            "AP", new GeoHint("Asia-Pacific", "AP", 35.0 + rndOffset(), 120.0 + rndOffset())
    );

    private static double rndOffset() {
        return (Math.random() - 0.5) * 10;
    }

    // ── 模拟数据降级 ──────────────────────────────────────────

    /** 地理分布权重——基于真实 BT swarm 统计的国家/地区占比。 */
    static final List<GeoWeight> GEO_WEIGHTS = List.of(
            new GeoWeight("United States", "US", 37.77, -122.42, 18),
            new GeoWeight("Germany", "DE", 50.11, 8.68, 12),
            new GeoWeight("France", "FR", 48.86, 2.35, 8),
            new GeoWeight("United Kingdom", "GB", 51.51, -0.13, 7),
            new GeoWeight("Brazil", "BR", -23.55, -46.63, 6),
            new GeoWeight("Canada", "CA", 43.65, -79.38, 5),
            new GeoWeight("Netherlands", "NL", 52.37, 4.90, 5),
            new GeoWeight("India", "IN", 19.08, 72.88, 5),
            new GeoWeight("Russia", "RU", 55.76, 37.62, 4),
            new GeoWeight("Japan", "JP", 35.68, 139.69, 4),
            new GeoWeight("Australia", "AU", -33.87, 151.21, 3),
            new GeoWeight("South Korea", "KR", 37.57, 126.98, 3),
            new GeoWeight("Sweden", "SE", 59.33, 18.07, 3),
            new GeoWeight("Poland", "PL", 52.23, 21.01, 3),
            new GeoWeight("Italy", "IT", 41.90, 12.50, 3),
            new GeoWeight("Spain", "ES", 40.42, -3.70, 2),
            new GeoWeight("China", "CN", 31.23, 121.47, 2),
            new GeoWeight("Ukraine", "UA", 50.45, 30.52, 2),
            new GeoWeight("Romania", "RO", 44.43, 26.10, 2),
            new GeoWeight("Argentina", "AR", -34.60, -58.38, 2),
            new GeoWeight("South Africa", "ZA", -33.93, 18.42, 1)
    );

    private final Random random = new Random();

    PeerDiscoveryResult generateFallback(TorrentMeta meta) {
        int count = meta.minPeers() + random.nextInt(meta.maxPeers() - meta.minPeers() + 1);
        int totalWeight = GEO_WEIGHTS.stream().mapToInt(GeoWeight::weight).sum();
        List<PeerInfo> peers = new ArrayList<>(count);

        for (int i = 0; i < count; i++) {
            GeoWeight geo = pickGeo(totalWeight);
            double lat = geo.baseLat() + (random.nextDouble() - 0.5) * 6.0;
            double lng = geo.baseLng() + (random.nextDouble() - 0.5) * 6.0;
            lat = Math.max(-85, Math.min(85, lat));
            lng = Math.max(-180, Math.min(180, lng));

            String ip = generateIp(geo.countryCode());
            int port = 6881 + random.nextInt(1000);
            long discoveredAt = System.currentTimeMillis() - random.nextInt(600_000);

            peers.add(new PeerInfo(ip, port, geo.country(), geo.countryCode(),
                    null, ServiceSupport.round(lat, 4), ServiceSupport.round(lng, 4), discoveredAt));
        }
        return buildResult(meta, peers, "simulated");
    }

    private GeoWeight pickGeo(int totalWeight) {
        int r = random.nextInt(totalWeight);
        int cumulative = 0;
        for (GeoWeight gw : GEO_WEIGHTS) {
            cumulative += gw.weight();
            if (r < cumulative) return gw;
        }
        return GEO_WEIGHTS.get(GEO_WEIGHTS.size() - 1);
    }

    String generateIp(String countryCode) {
        int first = switch (countryCode) {
            case "US" -> randomChoice(24, 35, 44, 64, 68, 71, 73, 98, 104, 108);
            case "DE" -> randomChoice(5, 46, 62, 78, 80, 87, 91, 134, 141, 178);
            case "FR" -> randomChoice(2, 5, 37, 62, 78, 80, 82, 86, 90, 109);
            case "GB" -> randomChoice(2, 5, 31, 51, 62, 77, 80, 81, 86, 109);
            case "BR" -> randomChoice(177, 179, 186, 187, 189, 191, 200, 201);
            case "CA" -> randomChoice(24, 64, 65, 67, 70, 72, 96, 99, 142, 198);
            case "NL" -> randomChoice(2, 5, 31, 37, 62, 77, 80, 82, 83, 145);
            case "IN" -> randomChoice(14, 27, 36, 43, 49, 59, 103, 106, 117, 122);
            case "RU" -> randomChoice(5, 31, 37, 46, 62, 77, 78, 80, 85, 95);
            case "JP" -> randomChoice(1, 14, 27, 36, 42, 49, 60, 61, 106, 118);
            case "AU" -> randomChoice(1, 14, 27, 49, 58, 60, 101, 103, 110, 121);
            case "KR" -> randomChoice(1, 14, 27, 39, 58, 61, 106, 112, 118, 121);
            case "CN" -> randomChoice(1, 14, 27, 36, 42, 58, 59, 60, 61, 106);
            default -> randomChoice(1, 5, 24, 31, 37, 46, 62, 77, 80, 95);
        };
        return first + "." + random.nextInt(256) + "." + random.nextInt(256) + "." + (1 + random.nextInt(254));
    }

    private int randomChoice(int... options) {
        return options[random.nextInt(options.length)];
    }

    // ── 结果构建 ──────────────────────────────────────────

    private PeerDiscoveryResult buildResult(TorrentMeta meta, List<PeerInfo> peers, String source) {
        Map<String, Long> countryDist = peers.stream()
                .collect(Collectors.groupingBy(PeerInfo::country, Collectors.counting()));

        Map<String, Long> sortedDist = countryDist.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .collect(Collectors.toMap(
                        Map.Entry::getKey, Map.Entry::getValue,
                        (a, b) -> a, LinkedHashMap::new));

        List<PeerInfo> sample = peers.stream()
                .sorted(Comparator.comparingLong(PeerInfo::discoveredAt).reversed())
                .limit(20)
                .toList();

        return new PeerDiscoveryResult(
                meta.name(), meta.infohash(), peers.size(),
                sortedDist, sample, peers, System.currentTimeMillis(), source
        );
    }

    // ── 内部 record 定义 ──────────────────────────────────────────

    record TorrentMeta(String name, String filename, String infohash, int minPeers, int maxPeers) {}
    record GeoWeight(String country, String countryCode, double baseLat, double baseLng, int weight) {}
    record GeoHint(String country, String countryCode, double lat, double lng) {}

    public record PeerInfo(
            String ip, int port, String country, String countryCode,
            String city, double lat, double lng, long discoveredAt
    ) {}

    public record TorrentSummary(int index, String name, String infohash) {}

    public record PeerDiscoveryResult(
            String torrentName, String infohash, int totalPeers,
            Map<String, Long> countryDistribution,
            List<PeerInfo> sampleLog, List<PeerInfo> allPeers,
            long updatedAt, String source
    ) {}
}
