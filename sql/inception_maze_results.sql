CREATE TABLE IF NOT EXISTS inception_maze_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    grid_size       TINYINT     NOT NULL,
    path_length     SMALLINT    NOT NULL,
    min_path        SMALLINT    NOT NULL,
    detour_ratio    FLOAT       NOT NULL,
    dream_level     TINYINT     NOT NULL,
    wall_count      SMALLINT    NOT NULL,
    created_at      BIGINT      NOT NULL,
    INDEX idx_created     (created_at),
    INDEX idx_level       (dream_level),
    INDEX idx_detour      (detour_ratio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
