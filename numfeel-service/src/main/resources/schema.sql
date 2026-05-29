-- 所有业务表建表语句（迁移自旧版 Vert.x 各 Service 中的 DDL）。
-- 由 Spring R2DBC ConnectionFactoryInitializer 在启动时执行（IF NOT EXISTS 幂等）。

CREATE TABLE IF NOT EXISTS browser_fingerprints (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_hash VARCHAR(64) NOT NULL,
    canvas_hash VARCHAR(64),
    font_hash VARCHAR(64),
    webgl_hash VARCHAR(64),
    screen_info VARCHAR(128),
    timezone VARCHAR(64),
    language VARCHAR(32),
    platform VARCHAR(64),
    hardware_concurrency TINYINT,
    device_memory TINYINT,
    touch_support TINYINT(1),
    color_depth TINYINT,
    pixel_ratio FLOAT,
    entropy_bits FLOAT,
    ip_hint VARCHAR(64),
    created_at BIGINT NOT NULL,
    INDEX idx_full_hash (full_hash),
    INDEX idx_canvas_hash (canvas_hash),
    INDEX idx_font_hash (font_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS inference_leaderboard (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(32)    NOT NULL,
    score      SMALLINT       NOT NULL,
    rounds     TINYINT        NOT NULL,
    wins       TINYINT        NOT NULL,
    grade      VARCHAR(16)    NOT NULL,
    created_at BIGINT         NOT NULL,
    INDEX idx_score (score DESC),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stroop_results (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    total             SMALLINT   NOT NULL,
    correct_count     SMALLINT   NOT NULL,
    accuracy          DOUBLE     NOT NULL,
    avg_rt            DOUBLE     NOT NULL,
    con_avg_rt        DOUBLE     NOT NULL,
    inc_avg_rt        DOUBLE     NOT NULL,
    stroop_effect     DOUBLE     NOT NULL,
    grade             VARCHAR(16) NOT NULL,
    created_at        BIGINT     NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_stroop  (stroop_effect)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS barnum_results (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_group    VARCHAR(10) NOT NULL,
    rating_1      TINYINT     NOT NULL,
    rating_2      TINYINT     NOT NULL,
    rating_3      TINYINT     NOT NULL,
    rating_4      TINYINT     NOT NULL,
    rating_5      TINYINT     NOT NULL,
    avg_rating    DOUBLE      NOT NULL,
    created_at    BIGINT      NOT NULL,
    INDEX idx_user_group (user_group),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS captcha_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    passed_count    SMALLINT    NOT NULL,
    total_time_ms   INT         NOT NULL,
    grade           VARCHAR(4)  NOT NULL,
    lv_text         TINYINT     NOT NULL DEFAULT 0,
    lv_math         TINYINT     NOT NULL DEFAULT 0,
    lv_slider       TINYINT     NOT NULL DEFAULT 0,
    lv_grid         TINYINT     NOT NULL DEFAULT 0,
    lv_click        TINYINT     NOT NULL DEFAULT 0,
    lv_rotate       TINYINT     NOT NULL DEFAULT 0,
    lv_spatial      TINYINT     NOT NULL DEFAULT 0,
    lv_behavior     TINYINT     NOT NULL DEFAULT 0,
    time_text       INT         NOT NULL DEFAULT 0,
    time_math       INT         NOT NULL DEFAULT 0,
    time_slider     INT         NOT NULL DEFAULT 0,
    time_grid       INT         NOT NULL DEFAULT 0,
    time_click      INT         NOT NULL DEFAULT 0,
    time_rotate     INT         NOT NULL DEFAULT 0,
    time_spatial    INT         NOT NULL DEFAULT 0,
    time_behavior   INT         NOT NULL DEFAULT 0,
    created_at      BIGINT      NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_grade   (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS devil_deal_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    deal_type       VARCHAR(16)  NOT NULL,
    second_type     VARCHAR(16)  NOT NULL,
    power_pct       TINYINT      NOT NULL,
    love_pct        TINYINT      NOT NULL,
    money_pct       TINYINT      NOT NULL,
    revenge_pct     TINYINT      NOT NULL,
    recognition_pct TINYINT      NOT NULL,
    knowledge_pct   TINYINT      NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created   (created_at),
    INDEX idx_deal_type (deal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS cascade_failure_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    topology        VARCHAR(16)  NOT NULL,
    coupling        TINYINT      NOT NULL,
    capacity        TINYINT      NOT NULL,
    strategy        VARCHAR(16)  NOT NULL,
    trigger_pos     VARCHAR(8),
    survival_rate   DOUBLE       NOT NULL,
    cascade_steps   SMALLINT     NOT NULL,
    max_component   SMALLINT     NOT NULL,
    total_nodes     SMALLINT     NOT NULL,
    score           SMALLINT     NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_score   (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newcomb_results (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    choice      VARCHAR(4)  NOT NULL,
    prediction  VARCHAR(4)  NOT NULL,
    hit         TINYINT(1)  NOT NULL,
    payoff      INT         NOT NULL,
    created_at  BIGINT      NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_choice  (choice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sorites_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sand_boundary   INT          NOT NULL,
    sand_sharpness  VARCHAR(20)  NOT NULL,
    bald_boundary   INT          NOT NULL,
    color_boundary  INT          NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cosmic_reaper_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    strategy        VARCHAR(16)  NOT NULL,
    `escaped`       TINYINT(1)   NOT NULL DEFAULT 0,
    turns           SMALLINT     NOT NULL,
    score           SMALLINT     NOT NULL,
    final_tech      SMALLINT     NOT NULL,
    final_signal    SMALLINT     NOT NULL,
    final_stealth   SMALLINT     NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_score   (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seckill_stats (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    participants  INT       NOT NULL,
    stock         INT       NOT NULL,
    user_won      TINYINT   NOT NULL,
    user_rank     INT       NOT NULL,
    user_latency  DOUBLE    NOT NULL,
    latency_gap   DOUBLE    NOT NULL,
    created_at    BIGINT    NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS monkey_stats (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_text     VARCHAR(12)  NOT NULL,
    target_length   TINYINT      NOT NULL,
    total_attempts  BIGINT       NOT NULL,
    total_chars     BIGINT       NOT NULL,
    success         TINYINT      NOT NULL,
    time_elapsed    INT          NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_success (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
