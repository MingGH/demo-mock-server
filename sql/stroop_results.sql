CREATE TABLE IF NOT EXISTS stroop_results (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    total             SMALLINT   NOT NULL,
    correct_count     SMALLINT   NOT NULL,
    accuracy          DOUBLE     NOT NULL,
    avg_rt            DOUBLE     NOT NULL,
    con_avg_rt        DOUBLE     NOT NULL,
    inc_avg_rt        DOUBLE     NOT NULL,
    stroop_effect     DOUBLE     NOT NULL,
    grade             VARCHAR(16) NOT NULL,
    created_at        BIGINT     NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_stroop  (stroop_effect)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
