CREATE TABLE IF NOT EXISTS tarot_turing_results (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_seed       VARCHAR(64) NOT NULL,
    spread_id          VARCHAR(64) NOT NULL,
    best_slot          CHAR(1)     NOT NULL,
    best_role          VARCHAR(16) NOT NULL,
    guessed_ai_slot    CHAR(1)     NOT NULL,
    guessed_ai_role    VARCHAR(16) NOT NULL,
    guessed_ai_correct TINYINT(1)  NOT NULL,
    created_at         BIGINT      NOT NULL,
    INDEX idx_spread_id (spread_id),
    INDEX idx_best_role (best_role),
    INDEX idx_guessed_ai_role (guessed_ai_role),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
