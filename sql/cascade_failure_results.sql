CREATE TABLE IF NOT EXISTS cascade_failure_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    topology        VARCHAR(16)  NOT NULL COMMENT '拓扑类型 random/scale-free/grid/modular',
    coupling        TINYINT      NOT NULL COMMENT '耦合密度 10-90',
    capacity        TINYINT      NOT NULL COMMENT '容量余量 5-95',
    strategy        VARCHAR(16)  NOT NULL COMMENT '防御策略 none/hub/distributed',
    trigger_pos     VARCHAR(8)   COMMENT '引爆位置 hub/edge/random',
    survival_rate   DOUBLE       NOT NULL COMMENT '存活率 0-1',
    cascade_steps   SMALLINT     NOT NULL COMMENT '级联步数',
    max_component   SMALLINT     NOT NULL COMMENT '最大连通分量节点数',
    total_nodes     SMALLINT     NOT NULL COMMENT '总节点数',
    score           SMALLINT     NOT NULL COMMENT '得分 0-100',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_score   (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
