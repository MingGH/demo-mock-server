package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Row;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 尼姆游戏对局统计 — 业务逻辑层
 */
public class NimGameStatsService {

    private static final Logger log = LoggerFactory.getLogger(NimGameStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS nim_game_stats (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            result      ENUM('win', 'lose') NOT NULL COMMENT '玩家视角：win=玩家赢, lose=AI赢',
            difficulty  ENUM('easy', 'normal', 'hard') NOT NULL,
            rounds      SMALLINT NOT NULL COMMENT '本局总步数',
            preset      VARCHAR(16) NOT NULL DEFAULT 'classic' COMMENT '初始局面',
            created_at  BIGINT NOT NULL,
            INDEX idx_result (result),
            INDEX idx_difficulty (difficulty),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

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

    private final MySQLPool pool;

    public NimGameStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("nim_game_stats init failed: {}", ar.cause().getMessage());
            else log.info("nim_game_stats table ready");
        });
    }

    /**
     * 提交对局结果
     */
    public Future<JsonObject> submit(String result, String difficulty, int rounds, String preset) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(result, difficulty, rounds, preset, now))
            .compose(ignored -> getStats());
    }

    /**
     * 查询全局统计
     */
    public Future<JsonObject> getStats() {
        return pool.query(SQL_STATS).execute().map(rows -> {
            Row row = rows.iterator().next();
            long total = row.getLong("total");
            long playerWins = row.getLong("player_wins");
            long aiWins = row.getLong("ai_wins");
            long aiWinsHard = row.getLong("ai_wins_hard");
            long playerWinsHard = row.getLong("player_wins_hard");
            long gamesEasy = row.getLong("games_easy");
            long gamesNormal = row.getLong("games_normal");
            long gamesHard = row.getLong("games_hard");

            double aiWinRate = total > 0 ? (double) aiWins / total * 100 : 0;
            double aiWinRateHard = (aiWinsHard + playerWinsHard) > 0
                ? (double) aiWinsHard / (aiWinsHard + playerWinsHard) * 100 : 0;

            return new JsonObject()
                .put("total", total)
                .put("playerWins", playerWins)
                .put("aiWins", aiWins)
                .put("aiWinRate", Math.round(aiWinRate * 10) / 10.0)
                .put("aiWinRateHard", Math.round(aiWinRateHard * 10) / 10.0)
                .put("gamesEasy", gamesEasy)
                .put("gamesNormal", gamesNormal)
                .put("gamesHard", gamesHard);
        });
    }
}
