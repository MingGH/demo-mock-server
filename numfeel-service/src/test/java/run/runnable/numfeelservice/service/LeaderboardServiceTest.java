package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;
import run.runnable.numfeelservice.controller.dto.LeaderboardResponses.LeaderboardEntry;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LeaderboardServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonNode json(String s) {
        return MAPPER.readTree(s);
    }

    @Test
    void normalizePathKeepsPagesAndStripsLeadingSlash() {
        assertEquals("pages/wealth-button-paradox",
                LeaderboardService.normalizePath("/pages/wealth-button-paradox"));
        assertEquals("pages/dithering/",
                LeaderboardService.normalizePath("/pages/dithering/"));
    }

    @Test
    void normalizePathStripsHashAndQuery() {
        assertEquals("pages/dithering/",
                LeaderboardService.normalizePath("/pages/dithering/#google_vignette"));
        assertEquals("pages/browser-fingerprint",
                LeaderboardService.normalizePath("/pages/browser-fingerprint?utm=x"));
    }

    @Test
    void normalizePathRejectsHomeAndNonPages() {
        assertNull(LeaderboardService.normalizePath("/"));
        assertNull(LeaderboardService.normalizePath("/leaderboard/"));
        assertNull(LeaderboardService.normalizePath("/pages/"));
        assertNull(LeaderboardService.normalizePath(null));
        assertNull(LeaderboardService.normalizePath(""));
    }

    @Test
    void cleanseExcludesHomeAndSortsDescending() {
        JsonNode raw = json("""
                [
                  {"x":"/pages/a","y":100},
                  {"x":"/","y":9999},
                  {"x":"/pages/b","y":300},
                  {"x":"/pages/c","y":200}
                ]
                """);
        List<LeaderboardEntry> result = LeaderboardService.cleanse(raw);
        assertEquals(3, result.size());
        assertEquals("pages/b", result.get(0).path());
        assertEquals(300, result.get(0).views());
        assertEquals("pages/c", result.get(1).path());
        assertEquals("pages/a", result.get(2).path());
    }

    @Test
    void cleanseMergesDuplicatePathsAfterNormalization() {
        JsonNode raw = json("""
                [
                  {"x":"/pages/dithering/","y":204},
                  {"x":"/pages/dithering/#google_vignette","y":235},
                  {"x":"/pages/other","y":50}
                ]
                """);
        List<LeaderboardEntry> result = LeaderboardService.cleanse(raw);
        assertEquals(2, result.size());
        assertEquals("pages/dithering/", result.get(0).path());
        assertEquals(439, result.get(0).views());
    }

    @Test
    void cleanseHandlesEmptyOrNull() {
        assertTrue(LeaderboardService.cleanse(null).isEmpty());
        assertTrue(LeaderboardService.cleanse(json("[]")).isEmpty());
    }

    @Test
    void cleanseCapsAtTwentyEntries() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < 30; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"x\":\"/pages/p").append(i).append("\",\"y\":").append(i).append('}');
        }
        sb.append(']');
        List<LeaderboardEntry> result = LeaderboardService.cleanse(json(sb.toString()));
        assertEquals(20, result.size());
        // 最高的 y=29 应排第一
        assertEquals("pages/p29", result.get(0).path());
    }
}
