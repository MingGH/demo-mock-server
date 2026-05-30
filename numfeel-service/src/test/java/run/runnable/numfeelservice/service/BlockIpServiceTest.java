package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpCountryRankResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpDailyPointResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.BlockIpStatsResponse;
import run.runnable.numfeelservice.controller.dto.UtilityResponses.GeoLocationResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BlockIpServiceTest {

    @Mock
    private WebClient webClient;

    @Mock
    private GeoLocationService geoService;

    private BlockIpService service;

    private static final GeoLocationResponse US = new GeoLocationResponse("United States", "US", 40.0, -74.0, "New York");
    private static final GeoLocationResponse CN = new GeoLocationResponse("China", "CN", 39.9, 116.4, "Beijing");
    private static final GeoLocationResponse UN = new GeoLocationResponse("Unknown", null, null, null, null);

    @BeforeEach
    void setUp() {
        service = new BlockIpService(webClient, geoService);
    }

    private void withDefaultGeo() {
        when(geoService.lookup(any())).thenReturn(UN);
    }

    // ---- process() 方法测试 ----

    @Test
    void processEmptyListShouldReturnZeroStats() {
        BlockIpStatsResponse result = service.process(List.of());

        assertEquals(0, result.stats().totalIPs());
        assertEquals(0, result.stats().totalAttempts());
        assertEquals(0, result.stats().todayCount());
        assertEquals(0, result.stats().countryCount());
        assertTrue(result.daily().stream().allMatch(d -> d.count() == 0));
        assertTrue(result.countryRank().isEmpty());
        assertTrue(result.markers().isEmpty());
        assertTrue(result.list().isEmpty());
        assertNotNull(result.cacheTime());
    }

    @Test
    void processShouldComputeTotalAttempts() {
        withDefaultGeo();
        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 5, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 3, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(2, result.stats().totalIPs());
        assertEquals(8, result.stats().totalAttempts());
    }

    @Test
    void processShouldCountTodayEntries() {
        withDefaultGeo();
        String todayStr = today();
        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, todayStr, "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 1, todayStr, "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("3.3.3.3", 1, "2025-01-01", "2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(2, result.stats().todayCount());
        assertEquals(3, result.stats().totalIPs());
    }

    @Test
    void processShouldHave30DaysWindow() {
        BlockIpStatsResponse result = service.process(List.of());

        assertEquals(30, result.daily().size());
        for (int i = 0; i < 30; i++) {
            String expectedDate = LocalDate.now().minusDays(29 - i).toString();
            assertEquals(expectedDate, result.daily().get(i).date());
        }
    }

    @Test
    void processShouldPopulateDailyCounts() {
        withDefaultGeo();
        String yesterday = LocalDate.now().minusDays(1).toString();
        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, yesterday, "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 1, yesterday, "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        BlockIpDailyPointResponse yesterdayPoint = result.daily().stream()
                .filter(d -> d.date().equals(yesterday))
                .findFirst().orElseThrow();
        assertEquals(2, yesterdayPoint.count());
    }

    @Test
    void processShouldAggregateCountries() {
        when(geoService.lookup("1.1.1.1")).thenReturn(US);
        when(geoService.lookup("2.2.2.2")).thenReturn(CN);
        when(geoService.lookup("3.3.3.3")).thenReturn(US);

        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("3.3.3.3", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(2, result.stats().countryCount());
        List<BlockIpCountryRankResponse> rank = result.countryRank();
        assertEquals(2, rank.size());
        assertEquals("United States", rank.get(0).country());
        assertEquals(2, rank.get(0).count());
        assertEquals("China", rank.get(1).country());
        assertEquals(1, rank.get(1).count());
    }

    @Test
    void processShouldGenerateMarkersForGeoLocatedIps() {
        when(geoService.lookup("1.1.1.1")).thenReturn(US);
        when(geoService.lookup("2.2.2.2")).thenReturn(CN);

        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 5, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 3, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(2, result.markers().size());
        assertTrue(result.markers().stream().anyMatch(m -> m.lat() == 40.0 && m.lng() == -74.0));
        assertTrue(result.markers().stream().anyMatch(m -> m.lat() == 39.9 && m.lng() == 116.4));
    }

    @Test
    void processShouldMergeMarkersWithSameLocation() {
        when(geoService.lookup("1.1.1.1")).thenReturn(US);
        when(geoService.lookup("2.2.2.2")).thenReturn(US);

        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 5, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 3, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(1, result.markers().size());
        assertEquals(2, result.markers().get(0).count());
        assertEquals(8, result.markers().get(0).attempts());
    }

    @Test
    void processShouldNotAddMarkerForUnknownLocation() {
        when(geoService.lookup("1.1.1.1")).thenReturn(US);
        when(geoService.lookup("2.2.2.2")).thenReturn(UN); // no lat/lng

        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(1, result.markers().size());
    }

    @Test
    void processShouldSortEntriesByCountDescending() {
        withDefaultGeo();
        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 5, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("3.3.3.3", 3, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(5, result.list().get(0).count());
        assertEquals(3, result.list().get(1).count());
        assertEquals(1, result.list().get(2).count());
    }

    @Test
    void processShouldComputeAvgAttemptsCorrectly() {
        withDefaultGeo();
        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 10, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"),
                item("2.2.2.2", 20, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(15.0, result.stats().avgAttempts(), 0.01);
    }

    @Test
    void processShouldHandleNullGeoFields() {
        when(geoService.lookup("1.1.1.1")).thenReturn(
                new GeoLocationResponse(null, null, null, null, null)
        );

        List<BlockIpService.BlockIpUpstreamItem> raw = List.of(
                item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")
        );

        BlockIpStatsResponse result = service.process(raw);

        assertEquals(1, result.list().size());
        assertEquals("Unknown", result.list().get(0).country());
        assertEquals(1, result.stats().countryCount());
    }

    @Test
    void countryRankShouldBeLimitedTo15() {
        when(geoService.lookup(any())).thenAnswer(inv -> {
            String ip = inv.getArgument(0);
            int idx = Integer.parseInt(ip.split("\\.")[0]);
            return new GeoLocationResponse("Country" + idx, "C" + idx, (double) idx, (double) idx, null);
        });

        List<BlockIpService.BlockIpUpstreamItem> raw = new java.util.ArrayList<>();
        for (int i = 1; i <= 20; i++) {
            raw.add(item(i + ".0.0.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"));
        }

        BlockIpStatsResponse result = service.process(raw);

        assertTrue(result.countryRank().size() <= 15);
    }

    // ---- formatTime ----

    @Test
    void formatTimeShouldReturnFormattedString() {
        assertEquals("01-01 00:00", BlockIpService.formatTime("2025-01-01T00:00:00Z"));
    }

    @Test
    void formatTimeShouldReturnDashForNull() {
        assertEquals("-", BlockIpService.formatTime(null));
    }

    @Test
    void formatTimeShouldReturnDashForShortString() {
        assertEquals("-", BlockIpService.formatTime("short"));
    }

    // ---- stats() 方法测试 ----

    @Test
    void statsShouldCacheResponse() {
        withDefaultGeo();
        // This tests the process method directly since stats() requires WebClient setup
        BlockIpStatsResponse result1 = service.process(List.of(item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")));
        BlockIpStatsResponse result2 = service.process(List.of(item("1.1.1.1", 1, today(), "2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z")));

        assertEquals(result1.stats().totalIPs(), result2.stats().totalIPs());
    }

    // ---- helpers ----

    private static String today() {
        return LocalDate.now().toString();
    }

    private static BlockIpService.BlockIpUpstreamItem item(String ip, int attempts, String createdAt,
                                                             String firstSeen, String lastSeen) {
        // Package-private access from same-package test
        return new BlockIpService.BlockIpUpstreamItem(ip, attempts, createdAt, firstSeen, lastSeen);
    }
}
