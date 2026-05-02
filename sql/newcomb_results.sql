CREATE TABLE IF NOT EXISTS newcomb_results (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    choice      VARCHAR(4)  NOT NULL COMMENT '用户选择: one / two',
    prediction  VARCHAR(4)  NOT NULL COMMENT '预测器预测: one / two',
    hit         TINYINT(1)  NOT NULL COMMENT '预测是否命中: 0/1',
    payoff      INT         NOT NULL COMMENT '用户收益（元）',
    created_at  BIGINT      NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_choice  (choice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
