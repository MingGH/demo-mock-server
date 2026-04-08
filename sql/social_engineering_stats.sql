-- 社会工程学防骗挑战统计表

CREATE TABLE IF NOT EXISTS se_sessions (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id  VARCHAR(36) NOT NULL,
    total       TINYINT NOT NULL,
    correct     TINYINT NOT NULL,
    all_correct TINYINT(1) NOT NULL DEFAULT 0,
    created_at  BIGINT NOT NULL,
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS se_question_results (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id  VARCHAR(36) NOT NULL,
    question_id TINYINT NOT NULL,
    tactic      VARCHAR(32) NOT NULL,
    is_fake     TINYINT(1) NOT NULL,
    correct     TINYINT(1) NOT NULL,
    created_at  BIGINT NOT NULL,
    INDEX idx_session_id (session_id),
    INDEX idx_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
