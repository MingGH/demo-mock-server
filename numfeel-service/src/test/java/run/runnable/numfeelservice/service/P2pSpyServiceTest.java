package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

import static org.junit.jupiter.api.Assertions.*;

class P2pSpyServiceTest {

    private P2pSpyService service;

    @BeforeEach
    void setUp() {
        // 测试环境关闭 DHT，避免网络依赖和超时
        service = new P2pSpyService(false);
    }

    @Test
    void getPeersShouldReturnPeersForDefaultTorrent() {
        // DHT 查询在测试环境可能失败（无网络），但 fallback 应能工作
        StepVerifier.create(service.getPeers(0))
                .assertNext(result -> {
                    assertEquals("ubuntu-24.04.2-desktop-amd64.iso", result.torrentName());
                    assertNotNull(result.infohash());
                    assertTrue(result.totalPeers() > 0);
                    assertFalse(result.countryDistribution().isEmpty());
                    assertFalse(result.allPeers().isEmpty());
                    assertNotNull(result.updatedAt());
                    assertNotNull(result.source());
                })
                .verifyComplete();
    }

    @Test
    void getPeersShouldClampNegativeIndex() {
        StepVerifier.create(service.getPeers(-1))
                .assertNext(result -> {
                    assertEquals("ubuntu-24.04.2-desktop-amd64.iso", result.torrentName());
                })
                .verifyComplete();
    }

    @Test
    void getPeersShouldClampTooLargeIndex() {
        StepVerifier.create(service.getPeers(999))
                .assertNext(result -> {
                    assertEquals("LibreOffice_24.8.0_Linux_x86-64_deb.tar.gz", result.torrentName());
                })
                .verifyComplete();
    }

    @Test
    void getPeersShouldCacheResults() {
        P2pSpyService.PeerDiscoveryResult first = service.getPeers(0).block();
        P2pSpyService.PeerDiscoveryResult second = service.getPeers(0).block();
        assertNotNull(first);
        assertNotNull(second);
        assertEquals(first.totalPeers(), second.totalPeers());
        assertEquals(first.allPeers().get(0).ip(), second.allPeers().get(0).ip());
    }

    @Test
    void getPeersShouldReturnValidGeoData() {
        StepVerifier.create(service.getPeers(0))
                .assertNext(result -> {
                    for (P2pSpyService.PeerInfo peer : result.allPeers()) {
                        assertNotNull(peer.ip());
                        assertFalse(peer.ip().isBlank());
                        assertTrue(peer.port() > 0 && peer.port() < 65536);
                        assertNotNull(peer.country());
                        assertNotNull(peer.countryCode());
                    }
                })
                .verifyComplete();
    }

    @Test
    void getPeersShouldReturnCountryDistributionSumMatchingTotalPeers() {
        StepVerifier.create(service.getPeers(0))
                .assertNext(result -> {
                    long distSum = result.countryDistribution().values().stream()
                            .mapToLong(Long::longValue).sum();
                    assertEquals(result.totalPeers(), (int) distSum);
                })
                .verifyComplete();
    }

    @Test
    void getPeersShouldReturnSampleLogMaxTwenty() {
        StepVerifier.create(service.getPeers(0))
                .assertNext(result -> {
                    assertTrue(result.sampleLog().size() <= 20);
                    assertTrue(result.sampleLog().size() > 0);
                })
                .verifyComplete();
    }

    @Test
    void listTorrentsShouldReturnAllPresets() {
        StepVerifier.create(service.listTorrents())
                .assertNext(list -> {
                    assertEquals(3, list.size());
                    assertEquals(0, list.get(0).index());
                    assertEquals(1, list.get(1).index());
                    assertEquals(2, list.get(2).index());
                    assertNotNull(list.get(0).name());
                    assertNotNull(list.get(0).infohash());
                })
                .verifyComplete();
    }

    @Test
    void generateIpShouldReturnValidFormat() {
        String ip = service.generateIp("US");
        assertNotNull(ip);
        String[] parts = ip.split("\\.");
        assertEquals(4, parts.length);
        for (String part : parts) {
            int n = Integer.parseInt(part);
            assertTrue(n >= 0 && n <= 255);
        }
    }

    @Test
    void generateFallbackShouldRespectMinMaxBounds() {
        P2pSpyService.TorrentMeta meta = new P2pSpyService.TorrentMeta(
                "test", "test.iso", "abcdef0123456789abcdef0123456789abcdef01", 10, 20);
        P2pSpyService.PeerDiscoveryResult result = service.generateFallback(meta);
        assertTrue(result.totalPeers() >= 10);
        assertTrue(result.totalPeers() <= 20);
        assertEquals("simulated", result.source());
    }

    @Test
    void guessGeoByIpShouldReturnValidHint() {
        P2pSpyService.GeoHint hint = P2pSpyService.guessGeoByIp("104.25.1.1");
        assertNotNull(hint);
        assertNotNull(hint.country());
        assertNotNull(hint.countryCode());
    }
}
