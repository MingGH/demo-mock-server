package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * 统计侦探排行榜 — 业务逻辑层
 */
public class InferenceLeaderboardService {

    private static final Logger log = LoggerFactory.getLogger(InferenceLeaderboardService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS inference_leaderboard (
            id         BIGINT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(32)    NOT NULL,
            score      SMALLINT       NOT NULL,
            rounds     TINYINT        NOT NULL,
            wins       TINYINT        NOT NULL,
            grade      VARCHAR(16)    NOT NULL,
            created_at BIGINT         NOT NULL,
            INDEX idx_score (score DESC),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT =
        "INSERT INTO inference_leaderboard (name, score, rounds, wins, grade, created_at) VALUES (?,?,?,?,?,?)";

    private static final String SQL_TOP =
        "SELECT id, name, score, rounds, wins, grade, created_at FROM inference_leaderboard ORDER BY score DESC, created_at ASC LIMIT ?";

    private static final String SQL_RANK =
        "SELECT COUNT(*) + 1 AS `rank` FROM inference_leaderboard WHERE score > ?";

    private static final String SQL_TOTAL =
        "SELECT COUNT(*) AS total FROM inference_leaderboard";

    private final MySQLPool pool;

    public InferenceLeaderboardService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("inference_leaderboard init failed: {}", ar.cause().getMessage());
            else log.info("inference_leaderboard table ready");
        });
    }

    /** 提交成绩，返回排名信息 */
    public Future<JsonObject> submit(String name, int score, int rounds, int wins, String grade) {
        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(name, score, rounds, wins, grade, now))
            .compose(ignored -> pool.preparedQuery(SQL_RANK).execute(Tuple.of(score)))
            .map(rows -> {
                long rank = rows.iterator().next().getLong("rank");
                return new JsonObject()
                    .put("name", name)
                    .put("score", score)
                    .put("rounds", rounds)
                    .put("wins", wins)
                    .put("grade", grade)
                    .put("rank", rank);
            });
    }

    /** 查询排行榜 top N + 总人数 */
    public Future<JsonObject> top(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        Future<JsonArray> leadersFuture = pool.preparedQuery(SQL_TOP)
            .execute(Tuple.of(safeLimit))
            .map(rows -> {
                JsonArray arr = new JsonArray();
                int rank = 1;
                for (var row : rows) {
                    arr.add(new JsonObject()
                        .put("rank", rank++)
                        .put("name", row.getString("name"))
                        .put("score", row.getInteger("score"))
                        .put("rounds", row.getInteger("rounds"))
                        .put("wins", row.getInteger("wins"))
                        .put("grade", row.getString("grade")));
                }
                return arr;
            });

        Future<Long> totalFuture = pool.query(SQL_TOTAL).execute()
            .map(rows -> rows.iterator().next().getLong("total"));

        return Future.all(leadersFuture, totalFuture).map(cf ->
            new JsonObject()
                .put("leaders", cf.<JsonArray>resultAt(0))
                .put("total", cf.<Long>resultAt(1))
        );
    }
}
