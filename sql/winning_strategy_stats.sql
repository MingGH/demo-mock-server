CREATE TABLE IF NOT EXISTS winning_strategy_stats (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    game        ENUM('bash', 'wythoff', 'coin') NOT NULL COMMENT '游戏类型',
    result      ENUM('win', 'lose') NOT NULL COMMENT '玩家视角',
    difficulty  ENUM('easy', 'normal', 'hard') NOT NULL,
    rounds      SMALLINT NOT NULL COMMENT '本局总步数',
    created_at  BIGINT NOT NULL,
    INDEX idx_game (game),
    INDEX idx_result (result),
    INDEX idx_difficulty (difficulty),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
