CREATE TABLE IF NOT EXISTS devil_deal_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    deal_type       VARCHAR(16)  NOT NULL COMMENT '主契约类型: power/love/money/revenge/recognition/knowledge',
    second_type     VARCHAR(16)  NOT NULL COMMENT '副契约类型',
    power_pct       TINYINT      NOT NULL COMMENT '权力维度百分比 0-100',
    love_pct        TINYINT      NOT NULL COMMENT '爱情维度百分比 0-100',
    money_pct       TINYINT      NOT NULL COMMENT '金钱维度百分比 0-100',
    revenge_pct     TINYINT      NOT NULL COMMENT '复仇维度百分比 0-100',
    recognition_pct TINYINT      NOT NULL COMMENT '被认可维度百分比 0-100',
    knowledge_pct   TINYINT      NOT NULL COMMENT '知识维度百分比 0-100',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created   (created_at),
    INDEX idx_deal_type (deal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
