package ninja._6.numfeelservice.service;

import tools.jackson.databind.node.ObjectNode;
import ninja._6.numfeelservice.web.Json;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * 必胜策略游戏对局统计 — 业务逻辑层（R2DBC 重写）。
 */
@Service
public class WinningStrategyStatsService {

    private static final String SQL_INSERT =
            "INSERT INTO winning_strategy_stats (game, result, difficulty, rounds, created_at) VALUES (?,?,?,?,?)";

    private static final String SQL_STATS = """
        SELECT
            COUNT(*) AS total,
            IFNULL(SUM(result = 'win'), 0) AS player_wins,
            IFNULL(SUM(result = 'lose'), 0) AS ai_wins,
            IFNULL(SUM(game = 'bash'), 0) AS games_bash,
            IFNULL(SUM(game = 'wythoff'), 0) AS games_wythoff,
            IFNULL(SUM(game = 'coin'), 0) AS games_coin,
            IFNULL(SUM(result = 'lose' AND difficulty = 'hard'), 0) AS ai_wins_hard,
            IFNULL(SUM(result = 'lose' AND game = 'bash'), 0) AS ai_wins_bash,
            IFNULL(SUM(result = 'lose' AND game = 'wythoff'), 0) AS ai_wins_wythoff,
            IFNULL(SUM(result = 'lose' AND game = 'coin'), 0) AS ai_wins_coin
        FROM winning_strategy_stats
        """;

    private final DatabaseClient db;

    public WinningStrategyStatsService(DatabaseClient db) {
        this.db = db;
    }

    public Mono<ObjectNode> submit(String game, String result, String difficulty, int rounds) {
        long now = Instant.now().toEpochMilli();
        return db.sql(SQL_INSERT)
                .bind(0, game).bind(1, result).bind(2, difficulty).bind(3, rounds).bind(4, now)
                .fetch().rowsUpdated()
                .then(getStats());
    }

    public Mono<ObjectNode> getStats() {
        return db.sql(SQL_STATS).map((row, meta) -> {
            long total = nz(row.get("total", Long.class));
            long playerWins = nz(row.get("player_wins", Long.class));
            long aiWins = nz(row.get("ai_wins", Long.class));
            long gamesBash = nz(row.get("games_bash", Long.class));
            long gamesWythoff = nz(row.get("games_wythoff", Long.class));
            long gamesCoin = nz(row.get("games_coin", Long.class));
            long aiWinsHard = nz(row.get("ai_wins_hard", Long.class));
            long aiWinsBash = nz(row.get("ai_wins_bash", Long.class));
            long aiWinsWythoff = nz(row.get("ai_wins_wythoff", Long.class));
            long aiWinsCoin = nz(row.get("ai_wins_coin", Long.class));

            double aiWinRate = total > 0 ? (double) aiWins / total * 100 : 0;

            ObjectNode obj = Json.obj();
            obj.put("total", total);
            obj.put("playerWins", playerWins);
            obj.put("aiWins", aiWins);
            obj.put("aiWinRate", Math.round(aiWinRate * 10) / 10.0);
            obj.put("gamesBash", gamesBash);
            obj.put("gamesWythoff", gamesWythoff);
            obj.put("gamesCoin", gamesCoin);
            obj.put("aiWinsHard", aiWinsHard);
            obj.put("aiWinsBash", aiWinsBash);
            obj.put("aiWinsWythoff", aiWinsWythoff);
            obj.put("aiWinsCoin", aiWinsCoin);
            return obj;
        }).one();
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
