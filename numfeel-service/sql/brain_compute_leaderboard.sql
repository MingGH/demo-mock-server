-- 人脑算力排行榜成绩
-- 与 src/main/resources/schema.sql 中的定义保持一致，作为备份。
CREATE TABLE IF NOT EXISTS brain_compute_leaderboard (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(32)  NOT NULL,
    score       SMALLINT     NOT NULL,
    reaction_ms INT          NOT NULL,
    cat_ms      INT          NOT NULL,
    ball_score  SMALLINT     NOT NULL,
    grade       VARCHAR(16)  NOT NULL,
    created_at  BIGINT       NOT NULL,
    INDEX idx_score (score DESC),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
