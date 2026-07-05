-- 排除选项改答案 用户行为记录
CREATE TABLE IF NOT EXISTS switch_answer_rounds (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    strategy    VARCHAR(10)  NOT NULL COMMENT 'stay 或 switch',
    won         TINYINT(1)   NOT NULL COMMENT '是否答对：1=对 0=错',
    options     TINYINT      NOT NULL DEFAULT 4 COMMENT '选项总数 N',
    eliminated  TINYINT      NOT NULL DEFAULT 2 COMMENT '排除数量 K',
    ip          VARCHAR(45)  DEFAULT NULL COMMENT '用户 IP（用于粗略去重）',
    created_at  BIGINT       NOT NULL COMMENT '提交时间戳（毫秒）',
    INDEX idx_created (created_at),
    INDEX idx_strategy (strategy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排除选项改答案 用户行为记录';
