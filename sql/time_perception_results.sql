CREATE TABLE IF NOT EXISTS time_perception_results (
    id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
    player_name             VARCHAR(24)  NOT NULL,
    total_score             SMALLINT     NOT NULL,
    weber_score             DOUBLE       NOT NULL,
    avg_abs_distortion      DOUBLE       NOT NULL,
    blank_avg_distortion    DOUBLE       NOT NULL,
    load_avg_distortion     DOUBLE       NOT NULL,
    emotion_avg_distortion  DOUBLE       NOT NULL,
    bias_direction          VARCHAR(16)  NOT NULL,
    grade                   VARCHAR(16)  NOT NULL,
    created_at              BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_score   (total_score),
    INDEX idx_grade   (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
