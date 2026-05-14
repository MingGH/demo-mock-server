package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.mysqlclient.MySQLPool;
import io.vertx.sqlclient.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public class VeilOfIgnoranceService {

    private static final Logger log = LoggerFactory.getLogger(VeilOfIgnoranceService.class);

    private static final String DDL = """
        CREATE TABLE IF NOT EXISTS veil_of_ignorance (
            id                BIGINT AUTO_INCREMENT PRIMARY KEY,
            policy_tax        TINYINT   NOT NULL,
            policy_edu        INT       NOT NULL,
            policy_health     TINYINT   NOT NULL,
            policy_inherit    TINYINT   NOT NULL,
            policy_basic_income INT     NOT NULL,
            attr_talent       TINYINT   NOT NULL,
            attr_family       TINYINT   NOT NULL,
            attr_health       TINYINT   NOT NULL,
            attr_luck         TINYINT   NOT NULL,
            market_income     INT       NOT NULL,
            after_tax         INT       NOT NULL,
            edu_boost         INT       NOT NULL,
            health_burden     INT       NOT NULL,
            inheritance_inc   INT       NOT NULL,
            disposable        INT       NOT NULL,
            qol_score         TINYINT   NOT NULL,
            created_at        BIGINT    NOT NULL,
            INDEX idx_qol (qol_score),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """;

    private static final String SQL_INSERT = """
        INSERT INTO veil_of_ignorance
          (policy_tax, policy_edu, policy_health, policy_inherit, policy_basic_income,
           attr_talent, attr_family, attr_health, attr_luck,
           market_income, after_tax, edu_boost, health_burden, inheritance_inc, disposable, qol_score, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """;

    private static final String SQL_STATS = """
        SELECT COUNT(*) AS total_runs,
          ROUND(AVG(qol_score), 1) AS avg_qol,
          ROUND(AVG(policy_tax), 0) AS avg_tax,
          ROUND(AVG(policy_edu), 0) AS avg_edu,
          ROUND(AVG(policy_health), 0) AS avg_health_level,
          ROUND(AVG(policy_inherit), 0) AS avg_inherit,
          ROUND(AVG(policy_basic_income), 0) AS avg_basic_income
        FROM veil_of_ignorance
        """;

    private static final String SQL_SCATTER = """
        SELECT attr_talent, attr_family, attr_health, attr_luck,
          qol_score, policy_tax, policy_edu, policy_health, policy_inherit, policy_basic_income
        FROM veil_of_ignorance
        ORDER BY id DESC
        LIMIT 500
        """;

    private final MySQLPool pool;

    public VeilOfIgnoranceService(MySQLPool pool) {
        this.pool = pool;
        initTable();
    }

    private void initTable() {
        pool.query(DDL).execute(ar -> {
            if (ar.failed()) log.error("veil_of_ignorance init failed: {}", ar.cause().getMessage());
            else log.info("veil_of_ignorance table ready");
        });
    }

    public Future<JsonObject> submit(JsonObject body) {
        JsonObject policies = body.getJsonObject("policies");
        JsonObject attrs = body.getJsonObject("attrs");
        JsonObject result = body.getJsonObject("result");

        if (policies == null || attrs == null || result == null) {
            return Future.failedFuture("Missing fields");
        }

        long now = Instant.now().toEpochMilli();
        return pool.preparedQuery(SQL_INSERT)
            .execute(Tuple.of(
                policies.getInteger("taxRate"), policies.getInteger("eduSpend"),
                policies.getInteger("healthLevel"), policies.getInteger("inheritanceTax"),
                policies.getInteger("basicIncome"),
                attrs.getInteger("talent"), attrs.getInteger("family"),
                attrs.getInteger("health"), attrs.getInteger("luck"),
                result.getInteger("marketIncome"), result.getInteger("afterTax"),
                result.getInteger("eduBoost"), result.getInteger("healthBurden"),
                result.getInteger("inheritanceAfterTax"), result.getInteger("disposable"),
                result.getInteger("qol"), now
            ))
            .compose(ignored -> statsWithScatter());
    }

    public Future<JsonObject> stats() {
        return statsWithScatter();
    }

    private Future<JsonObject> statsWithScatter() {
        Future<JsonObject> statsFuture = pool.query(SQL_STATS).execute().map(rows -> {
            var row = rows.iterator().next();
            long totalRuns = row.getLong("total_runs");
            if (totalRuns == 0) {
                return new JsonObject().put("totalRuns", 0L);
            }
            return new JsonObject()
                .put("totalRuns", totalRuns)
                .put("avgQol", row.getDouble("avg_qol"))
                .put("avgTax", row.getDouble("avg_tax"))
                .put("avgEdu", row.getDouble("avg_edu"))
                .put("avgHealthLevel", row.getDouble("avg_health_level"))
                .put("avgInherit", row.getDouble("avg_inherit"))
                .put("avgBasicIncome", row.getDouble("avg_basic_income"));
        });

        Future<JsonArray> scatterFuture = pool.query(SQL_SCATTER).execute().map(rows -> {
            JsonArray arr = new JsonArray();
            rows.forEach(row -> {
                double attrAvg = (row.getInteger("attr_talent") + row.getInteger("attr_family")
                    + row.getInteger("attr_health") + row.getInteger("attr_luck")) / 4.0;
                int qol = row.getInteger("qol_score");
                arr.add(new JsonObject()
                    .put("attrAvg", Math.round(attrAvg * 10) / 10.0)
                    .put("qol", qol));
            });
            return arr;
        });

        return Future.all(statsFuture, scatterFuture).map(cf -> {
            JsonObject stats = cf.resultAt(0);
            JsonArray scatter = cf.resultAt(1);

            // 计算 Gini 近似
            double avgFairness = 0;
            if (scatter.size() > 0) {
                double[] qols = new double[scatter.size()];
                double sumQ = 0;
                for (int i = 0; i < scatter.size(); i++) {
                    qols[i] = scatter.getJsonObject(i).getInteger("qol");
                    sumQ += qols[i];
                }
                java.util.Arrays.sort(qols);
                double meanQ = sumQ / qols.length;
                if (meanQ > 0) {
                    double giniSum = 0;
                    for (int i = 0; i < qols.length; i++) {
                        giniSum += (2 * (i + 1) - qols.length - 1) * qols[i];
                    }
                    double gini = giniSum / (qols.length * qols.length * meanQ);
                    avgFairness = Math.round((1 - gini) * 100);
                }
            }

            stats.put("avgFairness", avgFairness);
            stats.put("scatter", scatter);
            return stats;
        });
    }
}
