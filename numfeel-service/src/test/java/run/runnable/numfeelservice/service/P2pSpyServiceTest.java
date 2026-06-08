package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * P2pSpyService 单元测试 — 侧重可测试的纯函数逻辑。
 * （数据库交互和 DHT 查询由集成测试覆盖。）
 */
class P2pSpyServiceTest {

    @Test
    void maskIpShouldHideLastTwoOctets() {
        assertEquals("104.25.*.*", P2pSpyService.maskIp("104.25.1.100"));
        assertEquals("192.168.*.*", P2pSpyService.maskIp("192.168.0.1"));
        assertEquals("10.0.*.*", P2pSpyService.maskIp("10.0.255.255"));
    }

    @Test
    void maskIpShouldHandleNull() {
        assertEquals("*.*.*.*", P2pSpyService.maskIp(null));
    }

    @Test
    void maskIpShouldHandleInvalidFormat() {
        assertEquals("abc", P2pSpyService.maskIp("abc"));
        assertEquals("1.2.3", P2pSpyService.maskIp("1.2.3"));
    }

    @Test
    void maskPeerShouldPreserveOtherFields() {
        P2pSpyService.PeerInfo original = new P2pSpyService.PeerInfo(
                "104.25.1.100", 6881, "United States", "US",
                "San Francisco", 37.77, -122.42, 1000L);
        P2pSpyService.PeerInfo masked = P2pSpyService.maskPeer(original);

        assertEquals("104.25.*.*", masked.ip());
        assertEquals(6881, masked.port());
        assertEquals("United States", masked.country());
        assertEquals("US", masked.countryCode());
        assertEquals("San Francisco", masked.city());
        assertEquals(37.77, masked.lat());
        assertEquals(-122.42, masked.lng());
        assertEquals(1000L, masked.discoveredAt());
    }

    @Test
    void listTorrentsShouldReturnPresets() {
        // PRESET_TORRENTS 包含 2 个 torrent
        assertEquals(2, P2pSpyService.PRESET_TORRENTS.size());
        assertEquals("611f70899d4e1d6a9c39cfc925f103dfef630328",
                P2pSpyService.PRESET_TORRENTS.get(0).infohash());
        assertEquals("58846860f0a766f8a42b0bb214d8c713fdf1b167",
                P2pSpyService.PRESET_TORRENTS.get(1).infohash());
    }
}
