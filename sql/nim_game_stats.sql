CREATE TABLE IF NOT EXISTS nim_game_stats (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    result      ENUM('win', 'lose') NOT NULL COMMENT '玩家视角：win=玩家赢, lose=AI赢',
    difficulty  ENUM('easy', 'normal', 'hard') NOT NULL,
    rounds      SMALLINT NOT NULL COMMENT '本局总步数',
    preset      VARCHAR(16) NOT NULL DEFAULT 'classic' COMMENT '初始局面',
    created_at  BIGINT NOT NULL,
    INDEX idx_result (result),
    INDEX idx_difficulty (difficulty),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='尼姆游戏对局统计';
