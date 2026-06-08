package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.service.P2pSpyService;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class P2pSpyControllerTest {

    private P2pSpyService mockService;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        mockService = mock(P2pSpyService.class);
        client = WebTestClient.bindToController(new P2pSpyController(mockService))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void getPeersShouldReturnOk() {
        P2pSpyService.PeerInfo peer = new P2pSpyService.PeerInfo(
                "104.25.1.100", 6881, "United States", "US",
                null, 37.77, -122.42, System.currentTimeMillis());
        P2pSpyService.PeerDiscoveryResult result = new P2pSpyService.PeerDiscoveryResult(
                "ubuntu-24.04.2-desktop-amd64.iso",
                "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
                1,
                Map.of("United States", 1L),
                List.of(peer),
                List.of(peer),
                System.currentTimeMillis(),
                "dht"
        );
        when(mockService.getPeers(0)).thenReturn(Mono.just(result));

        client.get().uri("/p2p/peers?index=0")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.torrentName").isEqualTo("ubuntu-24.04.2-desktop-amd64.iso")
                .jsonPath("$.data.totalPeers").isEqualTo(1)
                .jsonPath("$.data.allPeers[0].ip").isEqualTo("104.25.1.100");
    }

    @Test
    void getPeersDefaultIndexShouldWork() {
        P2pSpyService.PeerDiscoveryResult result = new P2pSpyService.PeerDiscoveryResult(
                "test", "abc", 0, Map.of(), List.of(), List.of(), 0L, "simulated");
        when(mockService.getPeers(0)).thenReturn(Mono.just(result));

        client.get().uri("/p2p/peers")
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    void getPeersServiceFailureShouldReturn500() {
        when(mockService.getPeers(anyInt()))
                .thenReturn(Mono.error(new RuntimeException("Simulated failure")));

        client.get().uri("/p2p/peers?index=0")
                .exchange()
                .expectStatus().isEqualTo(500)
                .expectBody()
                .jsonPath("$.status").isEqualTo(500)
                .jsonPath("$.message").isEqualTo("Internal error");
    }

    @Test
    void getTorrentsShouldReturnList() {
        List<P2pSpyService.TorrentSummary> list = List.of(
                new P2pSpyService.TorrentSummary(0, "Ubuntu 24.04", "abc123"),
                new P2pSpyService.TorrentSummary(1, "Blender 4.2", "def456")
        );
        when(mockService.listTorrents()).thenReturn(Mono.just(list));

        client.get().uri("/p2p/torrents")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.length()").isEqualTo(2)
                .jsonPath("$.data[0].name").isEqualTo("Ubuntu 24.04");
    }

    @Test
    void getTorrentsServiceFailureShouldReturn500() {
        when(mockService.listTorrents())
                .thenReturn(Mono.error(new RuntimeException("DB down")));

        client.get().uri("/p2p/torrents")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
