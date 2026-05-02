CREATE TABLE IF NOT EXISTS sorites_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sand_boundary   INT          NOT NULL,
    sand_sharpness  VARCHAR(20)  NOT NULL,
    bald_boundary   INT          NOT NULL,
    color_boundary  INT          NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
