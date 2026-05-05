CREATE TABLE IF NOT EXISTS cosmic_reaper_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    strategy        VARCHAR(16)  NOT NULL,
    escaped         TINYINT(1)   NOT NULL DEFAULT 0,
    turns           SMALLINT     NOT NULL,
    score           SMALLINT     NOT NULL,
    final_tech      SMALLINT     NOT NULL,
    final_signal    SMALLINT     NOT NULL,
    final_stealth   SMALLINT     NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_score   (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
