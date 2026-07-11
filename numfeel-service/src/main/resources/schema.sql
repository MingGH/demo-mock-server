-- 所有业务表建表语句（迁移自旧版 Vert.x 各 Service 中的 DDL）。
-- 由 SchemaInitializer 在应用启动后逐条执行。
-- 约定：
-- 1. 这里只放幂等的建表语句，不放 DROP / TRUNCATE / DELETE 等破坏性操作。
-- 2. 所有表统一使用 IF NOT EXISTS，避免重复启动时报错。

-- 浏览器指纹与追踪
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

-- 社会工程学测试：场次汇总
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

-- 社会工程学测试：题目级明细
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

-- 推理排行榜成绩
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

-- Stroop 测试结果
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

-- 巴纳姆效应评分结果
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

-- 验证码挑战综合结果
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

-- 筑梦迷宫测试结果
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

-- 恶魔交易选择结果
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

-- 时间知觉测试结果
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

-- 级联失效实验结果
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

-- Newcomb 悖论选择结果
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

-- 沙堆悖论测试结果
CREATE TABLE IF NOT EXISTS sorites_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sand_boundary   INT          NOT NULL,
    sand_sharpness  VARCHAR(20)  NOT NULL,
    bald_boundary   INT          NOT NULL,
    color_boundary  INT          NOT NULL,
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 宇宙死神策略测试结果
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

-- 秒杀实验统计
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

-- 无限猴子实验统计
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

-- Nim 博弈对局统计
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

-- 必胜策略小游戏统计
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

-- 康威生命游戏图案记录
CREATE TABLE IF NOT EXISTS game_of_life_patterns (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    pattern_key  VARCHAR(32) NOT NULL COMMENT '图案类型标识，如 glider、blinker',
    grid_data    MEDIUMTEXT NOT NULL COMMENT '当前网格的 JSON 序列化',
    grid_cols    SMALLINT NOT NULL,
    grid_rows    SMALLINT NOT NULL,
    description  VARCHAR(256) DEFAULT '',
    created_at   BIGINT NOT NULL,
    INDEX idx_pattern_key (pattern_key),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- EHP词条对比直觉测试结果
CREATE TABLE IF NOT EXISTS ehp_quiz_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    total_questions TINYINT    NOT NULL,
    correct_count   TINYINT    NOT NULL,
    q1_correct      TINYINT(1) NOT NULL DEFAULT 0,
    q2_correct      TINYINT(1) NOT NULL DEFAULT 0,
    q3_correct      TINYINT(1) NOT NULL DEFAULT 0,
    q4_correct      TINYINT(1) NOT NULL DEFAULT 0,
    q5_correct      TINYINT(1) NOT NULL DEFAULT 0,
    created_at      BIGINT     NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DHT peer 发现缓存（P2P 隐私透视镜）
CREATE TABLE IF NOT EXISTS dht_peers (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    infohash        VARCHAR(40)  NOT NULL,
    ip              VARCHAR(45)  NOT NULL,
    port            INT          NOT NULL,
    country         VARCHAR(64)  NOT NULL DEFAULT 'Unknown',
    country_code    VARCHAR(2)   NOT NULL DEFAULT 'XX',
    city            VARCHAR(128) NOT NULL DEFAULT '',
    lat             DOUBLE       NULL,
    lng             DOUBLE       NULL,
    torrent_name    VARCHAR(256) NOT NULL DEFAULT '',
    discovered_at   BIGINT       NOT NULL,
    INDEX idx_infohash (infohash),
    INDEX idx_discovered (discovered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 信息茧房模拟器实验结果
CREATE TABLE IF NOT EXISTS filter_bubble_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    entropy_drop    DOUBLE       NOT NULL COMMENT '信息熵下降百分比',
    dominant_cat    VARCHAR(16)  NOT NULL COMMENT '主导内容类型',
    dominant_pct    DOUBLE       NOT NULL COMMENT '主导类型占比',
    converge_round  SMALLINT     NOT NULL COMMENT '收敛轮次（-1表示未收敛）',
    total_rounds    SMALLINT     NOT NULL COMMENT '总轮次',
    click_sequence  VARCHAR(512) NOT NULL COMMENT '点击序列JSON，如["tech","tech","food"]',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at),
    INDEX idx_dominant (dominant_cat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 鹅腿 vs 鸭腿测评结果
CREATE TABLE IF NOT EXISTS goose_duck_results (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    correct_count   TINYINT      NOT NULL COMMENT '答对题数',
    total           TINYINT      NOT NULL COMMENT '总题数',
    answers         TEXT         NOT NULL COMMENT '各题作答详情JSON',
    created_at      BIGINT       NOT NULL,
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- 二维码劫持（QRLjacking）演示 session 记录
CREATE TABLE IF NOT EXISTS qr_hijack_sessions (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    token       VARCHAR(16) NOT NULL COMMENT '登录 session token',
    status      VARCHAR(10) NOT NULL DEFAULT 'pending' COMMENT 'pending / scanned',
    scanned_by  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '扫码设备描述',
    created_at  BIGINT      NOT NULL,
    scanned_at  BIGINT      NOT NULL DEFAULT 0,
    hijacked    TINYINT(1)  NOT NULL DEFAULT 0,
    INDEX idx_token (token),
    INDEX idx_created (created_at),
    INDEX idx_hijacked (hijacked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 50%财富按钮 — 聚合统计（替代外部 counter API）
CREATE TABLE IF NOT EXISTS wealth_button_stats (
    id          INT PRIMARY KEY DEFAULT 1,
    players     BIGINT NOT NULL DEFAULT 0,
    bankrupt    BIGINT NOT NULL DEFAULT 0,
    billionaire BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 50%财富按钮 — 排行榜
CREATE TABLE IF NOT EXISTS wealth_button_leaderboard (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL,
    final_wealth    DOUBLE       NOT NULL,
    return_rate     DOUBLE       NOT NULL,
    press_count     INT          NOT NULL,
    win_count       INT          NOT NULL,
    initial_wealth  INT          NOT NULL,
    round_history   TEXT         NOT NULL COMMENT '紧凑格式：W=赢 L=输，如 WWLWLLW',
    pow_hash        VARCHAR(64)  NOT NULL COMMENT 'SHA-256 PoW 哈希',
    pow_nonce       VARCHAR(32)  NOT NULL COMMENT 'PoW nonce',
    created_at      BIGINT       NOT NULL,
    INDEX idx_wealth   (final_wealth DESC),
    INDEX idx_return   (return_rate DESC),
    INDEX idx_username (username),
    INDEX idx_pow_hash (pow_hash),
    INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 排除选项改答案 用户行为记录
CREATE TABLE IF NOT EXISTS switch_answer_rounds (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    strategy    VARCHAR(10)  NOT NULL COMMENT 'stay 或 switch',
    won         TINYINT(1)   NOT NULL COMMENT '是否答对：1=对 0=错',
    options     TINYINT      NOT NULL DEFAULT 4 COMMENT '选项总数 N',
    eliminated  TINYINT      NOT NULL DEFAULT 2 COMMENT '排除数量 K',
    ip          VARCHAR(45)  DEFAULT NULL COMMENT '用户 IP（用于粗略去重）',
    created_at  BIGINT       NOT NULL COMMENT '提交时间戳（毫秒）',
    INDEX idx_created (created_at),
    INDEX idx_strategy (strategy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 人脑算力排行榜成绩
CREATE TABLE IF NOT EXISTS brain_compute_leaderboard (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(32)  NOT NULL,
    score       SMALLINT     NOT NULL,
    reaction_ms INT          NOT NULL,
    cat_ms      INT          NOT NULL,
    ball_score  SMALLINT     NOT NULL,
    grade       VARCHAR(16)  NOT NULL,
    created_at  BIGINT       NOT NULL,
    INDEX idx_score (score DESC),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
