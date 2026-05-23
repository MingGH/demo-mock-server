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
 * 必胜策略游戏对局统计 — 业务逻辑层
 */
public class WinningStrategyStatsService {

    private static final Logger log = LoggerFactory.getLogger(WinningStrategyStatsService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS winning_strategy_stats (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            game        ENUM('bash', 'wythoff', 'coin') NOT NULL COMMENT '游戏类型',
            result      ENUM('win', 'lose') NOT NULL COMMENT '玩家视角',
            difficulty  ENUM('easy', 'normal', 'hard') NOT NULL,
            rounds      SMALLINT NOT NULL COMMENT '本局总步数',
            created_at  BIGINT NOT NULL,
            INDEX idx_game (game),
            INDEX idx_result (result),
            INDEX idx_difficulty (difficulty),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

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

    private final MySQLPool pool;

    public WinningStrategyStatsService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("winning_strategy_stats init failed: {}", ar.cause().getMessage());
            else log.info("winning_strategy_stats table ready");
        });
    }

    public Future<JsonObject> submit(String game, String result, String difficulty, int rounds) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(game, result, difficulty, rounds, now))
            .compose(ignored -> getStats());
    }

    public Future<JsonObject> getStats() {
        return pool.query(SQL_STATS).execute().map(rows -> {
            Row row = rows.iterator().next();
            long total = row.getLong("total");
            long playerWins = row.getLong("player_wins");
            long aiWins = row.getLong("ai_wins");
            long gamesBash = row.getLong("games_bash");
            long gamesWythoff = row.getLong("games_wythoff");
            long gamesCoin = row.getLong("games_coin");
            long aiWinsHard = row.getLong("ai_wins_hard");
            long aiWinsBash = row.getLong("ai_wins_bash");
            long aiWinsWythoff = row.getLong("ai_wins_wythoff");
            long aiWinsCoin = row.getLong("ai_wins_coin");

            double aiWinRate = total > 0 ? (double) aiWins / total * 100 : 0;

            return new JsonObject()
                .put("total", total)
                .put("playerWins", playerWins)
                .put("aiWins", aiWins)
                .put("aiWinRate", Math.round(aiWinRate * 10) / 10.0)
                .put("gamesBash", gamesBash)
                .put("gamesWythoff", gamesWythoff)
                .put("gamesCoin", gamesCoin)
                .put("aiWinsHard", aiWinsHard)
                .put("aiWinsBash", aiWinsBash)
                .put("aiWinsWythoff", aiWinsWythoff)
                .put("aiWinsCoin", aiWinsCoin);
        });
    }
}
