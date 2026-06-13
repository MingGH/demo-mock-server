-- 信息茧房模拟器实验结果
CREATE TABLE IF NOT EXISTS filter_bubble_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    entropy_drop    DOUBLE       NOT NULL COMMENT '信息熵下降百分比',
    dominant_cat    VARCHAR(16)  NOT NULL COMMENT '主导内容类型',
    dominant_pct    DOUBLE       NOT NULL COMMENT '主导类型占比',
    converge_round  SMALLINT     NOT NULL COMMENT '收敛轮次（-1表示未收敛）',
    total_rounds    SMALLINT     NOT NULL COMMENT '总轮次',
    click_sequence  VARCHAR(512) NOT NULL COMMENT '点击序列JSON，如["tech","tech","food"]',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_dominant (dominant_cat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
