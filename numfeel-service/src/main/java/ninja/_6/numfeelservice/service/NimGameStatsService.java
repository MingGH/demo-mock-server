package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 尼姆游戏对局统计 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class NimGameStatsService {

    private static final String SQL_INSERT =
            "INSERT INTO nim_game_stats (result, difficulty, rounds, preset, created_at) VALUES (?,?,?,?,?)";

    private static final String SQL_STATS = """
        SELECT
            COUNT(*) AS total,
            SUM(result = 'win') AS player_wins,
            SUM(result = 'lose') AS ai_wins,
            SUM(result = 'lose' AND difficulty = 'hard') AS ai_wins_hard,
            SUM(result = 'win' AND difficulty = 'hard') AS player_wins_hard,
            SUM(difficulty = 'easy') AS games_easy,
            SUM(difficulty = 'normal') AS games_normal,
            SUM(difficulty = 'hard') AS games_hard
        FROM nim_game_stats
        """;

    private final DatabaseClient db;

    public NimGameStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String result, String difficulty, int rounds, String preset) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, result).bind(1, difficulty).bind(2, rounds).bind(3, preset).bind(4, now)
                .fetch().rowsUpdated()
                .then(getStats());
    }

    public Mono<ObjectNode> getStats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            long total = nz(row.get("total", Long.class));
            long playerWins = nz(row.get("player_wins", Long.class));
            long aiWins = nz(row.get("ai_wins", Long.class));
            long aiWinsHard = nz(row.get("ai_wins_hard", Long.class));
            long playerWinsHard = nz(row.get("player_wins_hard", Long.class));
            long gamesEasy = nz(row.get("games_easy", Long.class));
            long gamesNormal = nz(row.get("games_normal", Long.class));
            long gamesHard = nz(row.get("games_hard", Long.class));

            double aiWinRate = total > 0 ? (double) aiWins / total * 100 : 0;
            double aiWinRateHard = (aiWinsHard + playerWinsHard) > 0
                    ? (double) aiWinsHard / (aiWinsHard + playerWinsHard) * 100 : 0;

            ObjectNode obj = Json.obj();
            obj.put("total", total);
            obj.put("playerWins", playerWins);
            obj.put("aiWins", aiWins);
            obj.put("aiWinRate", Math.round(aiWinRate * 10) / 10.0);
            obj.put("aiWinRateHard", Math.round(aiWinRateHard * 10) / 10.0);
            obj.put("gamesEasy", gamesEasy);
            obj.put("gamesNormal", gamesNormal);
            obj.put("gamesHard", gamesHard);
            return obj;
        }).one();
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
