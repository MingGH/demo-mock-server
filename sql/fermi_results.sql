CREATE TABLE IF NOT EXISTS fermi_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    avg_oom         DOUBLE      NOT NULL,
    within_oom      SMALLINT    NOT NULL,
    grade           VARCHAR(4)  NOT NULL,
    created_at      BIGINT      NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_grade   (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
