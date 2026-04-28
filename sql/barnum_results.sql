CREATE TABLE IF NOT EXISTS barnum_results (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_group    VARCHAR(10) NOT NULL COMMENT '分组: tarot / random',
    rating_1      TINYINT     NOT NULL COMMENT '第1条评分 1-5',
    rating_2      TINYINT     NOT NULL COMMENT '第2条评分 1-5',
    rating_3      TINYINT     NOT NULL COMMENT '第3条评分 1-5',
    rating_4      TINYINT     NOT NULL COMMENT '第4条评分 1-5',
    rating_5      TINYINT     NOT NULL COMMENT '第5条评分 1-5',
    avg_rating    DOUBLE      NOT NULL COMMENT '5条平均分',
    created_at    BIGINT      NOT NULL,
    INDEX idx_user_group (user_group),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
