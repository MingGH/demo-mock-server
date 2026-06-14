-- 鹅腿 vs 鸭腿测评结果
CREATE TABLE IF NOT EXISTS goose_duck_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    correct_count   TINYINT      NOT NULL COMMENT '答对题数',
    total           TINYINT      NOT NULL COMMENT '总题数',
    answers         TEXT         NOT NULL COMMENT '各题作答详情JSON',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
