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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
