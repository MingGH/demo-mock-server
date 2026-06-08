package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import run.runnable.numfeelservice.service.dht.DhtPeerDiscovery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * P2P 隐私透视镜 — 通过真实 DHT 协议发现 peer，入库持久化，API 从数据库读取。
 * <p>
 * 工作模式：
 * 1. API 请求时从 MySQL dht_peers 表读取已有数据
 * 2. 如果数据库无数据或数据过期（>30min），后台异步触发 DHT 查询
 * 3. DHT 查到的 peer 经 GeoIP 定位后写入数据库
 * 4. 定时任务每 30 分钟刷新一次全部预设 torrent
 */
@Service
public class P2pSpyService {

    private static final Logger log = LoggerFactory.getLogger(P2pSpyService.class);
    private static final long DATA_EXPIRE_MS = 30 * 60 * 1000L; // 30 分钟

    /** 预设的合法公开 torrent 列表（infohash 来自官方 torrent 文件）。 */
    static final List<TorrentMeta> PRESET_TORRENTS = List.of(
            new TorrentMeta(
                    "ubuntu-24.04.2-desktop-amd64.iso",
                    "Ubuntu 24.04 Desktop ISO",
                    "611f70899d4e1d6a9c39cfc925f103dfef630328"
            ),
            new TorrentMeta(
                    "debian-13.5.0-amd64-netinst.iso",
                    "Debian 13.5 Netinst",
                    "58846860f0a766f8a42b0bb214d8c713fdf1b167"
            )
    );

    private final DatabaseClient db;
    private final GeoIpService geoIpService;
    private final Map<String, AtomicBoolean> refreshing = new ConcurrentHashMap<>();

    public P2pSpyService(DatabaseClient db, GeoIpService geoIpService) {
        this.db = db;
        this.geoIpService = geoIpService;
        PRESET_TORRENTS.forEach(t -> refreshing.put(t.infohash(), new AtomicBoolean(false)));
    }

    /**
     * 获取指定预设 torrent 的 peer 列表（从数据库读取）。
     * 如果数据库无数据或数据过期，会在后台异步触发 DHT 刷新。
     *
     * @param torrentIndex 预设 torrent 索引（0-based）
     * @return peer 列表和统计信息
     */
    public Mono<PeerDiscoveryResult> getPeers(int torrentIndex) {
        int idx = Math.max(0, Math.min(torrentIndex, PRESET_TORRENTS.size() - 1));
        TorrentMeta meta = PRESET_TORRENTS.get(idx);

        return loadFromDb(meta.infohash())
                .flatMap(peers -> {
                    if (peers.isEmpty() || isExpired(peers)) {
                        triggerAsyncRefresh(meta);
                        if (peers.isEmpty()) {
                            return Mono.just(emptyResult(meta));
                        }
                    }
                    return Mono.just(buildResult(meta, peers));
                });
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

    /** 定时任务：每 30 分钟刷新所有预设 torrent 的 peer 数据。 */
    @Scheduled(fixedDelay = 1800_000, initialDelay = 10_000)
    public void scheduledRefresh() {
        log.info("Scheduled DHT refresh starting for {} torrents", PRESET_TORRENTS.size());
        PRESET_TORRENTS.forEach(this::triggerAsyncRefresh);
    }

    // ── 数据库读写 ──────────────────────────────────────────

    private Mono<List<PeerInfo>> loadFromDb(String infohash) {
        return db.sql("""
                SELECT ip, port, country, country_code, city, lat, lng, discovered_at
                FROM dht_peers
                WHERE infohash = :infohash
                ORDER BY discovered_at DESC
                LIMIT 500
                """)
                .bind("infohash", infohash)
                .map((row, meta) -> new PeerInfo(
                        (String) row.get("ip"),
                        ((Number) row.get("port")).intValue(),
                        (String) row.get("country"),
                        (String) row.get("country_code"),
                        (String) row.get("city"),
                        row.get("lat") != null ? ((Number) row.get("lat")).doubleValue() : 0.0,
                        row.get("lng") != null ? ((Number) row.get("lng")).doubleValue() : 0.0,
                        row.get("discovered_at") != null ? ((Number) row.get("discovered_at")).longValue() : 0L
                ))
                .all()
                .collectList();
    }

    private Mono<Void> savePeersToDb(String infohash, String torrentName, List<PeerInfo> peers) {
        // 先删旧数据，再批量插入
        return db.sql("DELETE FROM dht_peers WHERE infohash = :infohash")
                .bind("infohash", infohash)
                .fetch().rowsUpdated()
                .then(Mono.defer(() -> {
                    if (peers.isEmpty()) return Mono.empty();
                    // 批量插入
                    var inserts = peers.stream().map(p ->
                            db.sql("""
                                INSERT INTO dht_peers (infohash, ip, port, country, country_code, city, lat, lng, torrent_name, discovered_at)
                                VALUES (:infohash, :ip, :port, :country, :cc, :city, :lat, :lng, :name, :ts)
                                """)
                                    .bind("infohash", infohash)
                                    .bind("ip", p.ip())
                                    .bind("port", p.port())
                                    .bind("country", p.country() != null ? p.country() : "Unknown")
                                    .bind("cc", p.countryCode() != null ? p.countryCode() : "XX")
                                    .bind("city", p.city() != null ? p.city() : "")
                                    .bind("lat", p.lat())
                                    .bind("lng", p.lng())
                                    .bind("name", torrentName)
                                    .bind("ts", p.discoveredAt())
                                    .fetch().rowsUpdated()
                    ).toList();
                    return Mono.when(inserts);
                }));
    }

    // ── DHT 查询与入库 ──────────────────────────────────────────

    private void triggerAsyncRefresh(TorrentMeta meta) {
        AtomicBoolean flag = refreshing.get(meta.infohash());
        if (flag == null || !flag.compareAndSet(false, true)) {
            return; // 已经有一个刷新在进行
        }

        Mono.fromCallable(() -> executeDhtQuery(meta))
                .subscribeOn(Schedulers.boundedElastic())
                .timeout(java.time.Duration.ofSeconds(20))
                .flatMap(peers -> savePeersToDb(meta.infohash(), meta.name(), peers)
                        .thenReturn(peers.size()))
                .doOnSuccess(count -> log.info("DHT refresh complete for {}: {} peers saved to DB",
                        meta.name(), count))
                .doOnError(err -> log.warn("DHT refresh failed for {}: {}",
                        meta.name(), err.getMessage()))
                .doFinally(signal -> flag.set(false))
                .subscribe();
    }

    private List<PeerInfo> executeDhtQuery(TorrentMeta meta) throws Exception {
        log.info("Starting DHT peer discovery for: {} ({})", meta.name(), meta.infohash().substring(0, 8));
        try (DhtPeerDiscovery dht = new DhtPeerDiscovery()) {
            List<DhtPeerDiscovery.DiscoveredPeer> rawPeers = dht.discoverPeers(meta.infohash());
            log.info("DHT returned {} raw peers for {}", rawPeers.size(), meta.name());
            return rawPeers.stream()
                    .map(this::enrichWithGeo)
                    .toList();
        }
    }

    // ── GeoIP 定位 ──────────────────────────────────────────

    private PeerInfo enrichWithGeo(DhtPeerDiscovery.DiscoveredPeer raw) {
        if (geoIpService != null && geoIpService.isAvailable()) {
            GeoIpService.GeoResult geo = geoIpService.lookup(raw.ip());
            if (geo != null && geo.country() != null) {
                return new PeerInfo(
                        raw.ip(), raw.port(),
                        geo.country(),
                        geo.countryCode() != null ? geo.countryCode() : "XX",
                        geo.city(),
                        geo.lat() != null ? geo.lat() : 0.0,
                        geo.lng() != null ? geo.lng() : 0.0,
                        System.currentTimeMillis()
                );
            }
        }
        // GeoIP 不可用时只保留 IP，不做推测
        return new PeerInfo(raw.ip(), raw.port(), "Unknown", "XX", null, 0.0, 0.0, System.currentTimeMillis());
    }

    // ── 结果构建 ──────────────────────────────────────────

    private boolean isExpired(List<PeerInfo> peers) {
        if (peers.isEmpty()) return true;
        long newest = peers.stream().mapToLong(PeerInfo::discoveredAt).max().orElse(0);
        return System.currentTimeMillis() - newest > DATA_EXPIRE_MS;
    }

    private PeerDiscoveryResult buildResult(TorrentMeta meta, List<PeerInfo> peers) {
        Map<String, Long> countryDist = peers.stream()
                .collect(Collectors.groupingBy(PeerInfo::country, Collectors.counting()));
        Map<String, Long> sortedDist = countryDist.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));

        List<PeerInfo> sample = peers.stream()
                .sorted(Comparator.comparingLong(PeerInfo::discoveredAt).reversed())
                .limit(20)
                .map(P2pSpyService::maskPeer)
                .toList();

        long newest = peers.stream().mapToLong(PeerInfo::discoveredAt).max().orElse(System.currentTimeMillis());
        return new PeerDiscoveryResult(meta.name(), meta.infohash(), peers.size(), sortedDist, sample, newest);
    }

    private PeerDiscoveryResult emptyResult(TorrentMeta meta) {
        return new PeerDiscoveryResult(meta.name(), meta.infohash(), 0, Map.of(), List.of(), System.currentTimeMillis());
    }

    /** IP 打码：保留前两段，后两段替换为 *。 */
    static PeerInfo maskPeer(PeerInfo peer) {
        String masked = maskIp(peer.ip());
        return new PeerInfo(masked, peer.port(), peer.country(), peer.countryCode(),
                peer.city(), peer.lat(), peer.lng(), peer.discoveredAt());
    }

    static String maskIp(String ip) {
        if (ip == null) return "*.*.*.*";
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return ip;
        return parts[0] + "." + parts[1] + ".*.*";
    }

    // ── Record 定义 ──────────────────────────────────────────

    record TorrentMeta(String name, String filename, String infohash) {}

    public record PeerInfo(
            String ip, int port, String country, String countryCode,
            String city, double lat, double lng, long discoveredAt
    ) {}

    public record TorrentSummary(int index, String name, String infohash) {}

    /** API 返回结构（不再返回 allPeers 完整列表，只返回统计 + 打码样本）。 */
    public record PeerDiscoveryResult(
            String torrentName, String infohash, int totalPeers,
            Map<String, Long> countryDistribution,
            List<PeerInfo> sampleLog,
            long updatedAt
    ) {}
}
