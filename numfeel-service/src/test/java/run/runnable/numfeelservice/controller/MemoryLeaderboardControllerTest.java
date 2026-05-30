package run.runnable.numfeelservice.controller;

import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryHistoryItem;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryLeaderboardGetQuery;
import run.runnable.numfeelservice.controller.dto.TrackingRequests.MemoryLeaderboardPostRequest;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;

/**
 * MemoryLeaderboardController HTTP 层测试。
 */
class MemoryLeaderboardControllerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToController(new MemoryLeaderboardController())
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void post_valid_body_returns_ok() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "TestPlayer");
        body.put("capacity", 7);
        ArrayNode history = MAPPER.createArrayNode();
        ObjectNode h1 = MAPPER.createObjectNode();
        h1.put("n", 3);
        h1.put("accuracy", 85.0);
        history.add(h1);
        ObjectNode h2 = MAPPER.createObjectNode();
        h2.put("n", 5);
        h2.put("accuracy", 90.0);
        history.add(h2);
        ObjectNode h3 = MAPPER.createObjectNode();
        h3.put("n", 7);
        h3.put("accuracy", 95.0);
        history.add(h3);
        body.set("history", history);

        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.name").isEqualTo("TestPlayer")
                .jsonPath("$.data.capacity").isEqualTo(7)
                .jsonPath("$.data.history.length()").isEqualTo(3);
    }

    @Test
    void post_computes_avg_accuracy() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player");
        body.put("capacity", 5);
        ArrayNode history = MAPPER.createArrayNode();
        ObjectNode h1 = MAPPER.createObjectNode();
        h1.put("n", 3);
        h1.put("accuracy", 80.0);
        history.add(h1);
        ObjectNode h2 = MAPPER.createObjectNode();
        h2.put("n", 5);
        h2.put("accuracy", 100.0);
        history.add(h2);
        body.set("history", history);

        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.avgAccuracy").isEqualTo(90.0);
    }

    @Test
    void post_null_body_returns_400() {
        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("")
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_missing_name_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("capacity", 5);

        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void post_invalid_capacity_returns_400() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Player");
        body.put("capacity", 50);

        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isEqualTo(400);
    }

    @Test
    void get_default_limit_returns_data() {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("name", "Alice");
        body.put("capacity", 10);
        body.set("history", MAPPER.createArrayNode());
        client.post().uri("/memory-challenge/leaderboard")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body.toString())
                .exchange()
                .expectStatus().isOk();

        client.get().uri("/memory-challenge/leaderboard")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.status").isEqualTo(200)
                .jsonPath("$.data.total").isEqualTo(1)
                .jsonPath("$.data.leaders.length()").isEqualTo(1)
                .jsonPath("$.data.leaders[0].name").isEqualTo("Alice");
    }

    @Test
    void get_with_limit_returns_truncated_list() {
        for (int i = 0; i < 3; i++) {
            ObjectNode body = MAPPER.createObjectNode();
            body.put("name", "Player" + i);
            body.put("capacity", 5 + i);
            body.set("history", MAPPER.createArrayNode());
            client.post().uri("/memory-challenge/leaderboard")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body.toString())
                    .exchange()
                    .expectStatus().isOk();
        }

        client.get().uri("/memory-challenge/leaderboard?limit=2")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.total").isEqualTo(3)
                .jsonPath("$.data.leaders.length()").isEqualTo(2);
    }

    @Test
    void get_ranking_sorts_by_capacity() {
        for (int capacity : new int[]{3, 10, 5}) {
            ObjectNode body = MAPPER.createObjectNode();
            body.put("name", "P" + capacity);
            body.put("capacity", capacity);
            body.set("history", MAPPER.createArrayNode());
            client.post().uri("/memory-challenge/leaderboard")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body.toString())
                    .exchange()
                    .expectStatus().isOk();
        }

        client.get().uri("/memory-challenge/leaderboard")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.data.leaders[0].capacity").isEqualTo(10)
                .jsonPath("$.data.leaders[0].rank").isEqualTo(1)
                .jsonPath("$.data.leaders[1].capacity").isEqualTo(5)
                .jsonPath("$.data.leaders[2].capacity").isEqualTo(3);
    }
}
