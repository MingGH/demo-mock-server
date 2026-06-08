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
                "104.25.*.*", 6881, "United States", "US",
                null, 37.77, -122.42, System.currentTimeMillis());
        P2pSpyService.PeerDiscoveryResult result = new P2pSpyService.PeerDiscoveryResult(
                "ubuntu-24.04.2-desktop-amd64.iso",
                "611f70899d4e1d6a9c39cfc925f103dfef630328",
                1,
                Map.of("United States", 1L),
                List.of(peer),
                System.currentTimeMillis()
        );
        when(mockService.getPeers(0)).thenReturn(Mono.just(result));

        client.get().uri("/p2p/peers?index=0")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.torrentName").isEqualTo("ubuntu-24.04.2-desktop-amd64.iso")
                .jsonPath("$.data.totalPeers").isEqualTo(1);
    }

    @Test
    void getPeersServiceFailureShouldReturn500() {
        when(mockService.getPeers(anyInt()))
                .thenReturn(Mono.error(new RuntimeException("DB error")));

        client.get().uri("/p2p/peers?index=0")
                .exchange()
                .expectStatus().isEqualTo(500);
    }

    @Test
    void getTorrentsShouldReturnList() {
        List<P2pSpyService.TorrentSummary> list = List.of(
                new P2pSpyService.TorrentSummary(0, "Ubuntu 24.04", "abc123"),
                new P2pSpyService.TorrentSummary(1, "Debian 13.5", "def456")
        );
        when(mockService.listTorrents()).thenReturn(Mono.just(list));

        client.get().uri("/p2p/torrents")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.length()").isEqualTo(2);
    }

    @Test
    void getTorrentsServiceFailureShouldReturn500() {
        when(mockService.listTorrents())
                .thenReturn(Mono.error(new RuntimeException("fail")));

        client.get().uri("/p2p/torrents")
                .exchange()
                .expectStatus().isEqualTo(500);
    }
}
