-- 浏览器指纹表
-- 对应接口：POST /fingerprint/collect、GET /fingerprint/stats
-- 创建时间：2026-04-05

CREATE TABLE IF NOT EXISTS browser_fingerprints (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_hash            VARCHAR(64)  NOT NULL COMMENT '全维度组合 SHA-256',
    canvas_hash          VARCHAR(64)           COMMENT 'Canvas 渲染指纹',
    font_hash            VARCHAR(64)           COMMENT '字体列表指纹',
    webgl_hash           VARCHAR(64)           COMMENT 'WebGL 渲染器指纹',
    screen_info          VARCHAR(128)          COMMENT '屏幕信息，如 1920x1080@24bit',
    timezone             VARCHAR(64)           COMMENT '时区，如 Asia/Shanghai',
    language             VARCHAR(32)           COMMENT '浏览器语言，如 zh-CN',
    platform             VARCHAR(64)           COMMENT '操作系统平台，如 MacIntel',
    hardware_concurrency TINYINT               COMMENT 'CPU 核心数',
    device_memory        TINYINT               COMMENT '设备内存 GB',
    touch_support        TINYINT(1)            COMMENT '是否支持触控',
    color_depth          TINYINT               COMMENT '色深 bit',
    pixel_ratio          FLOAT                 COMMENT '设备像素比',
    entropy_bits         FLOAT                 COMMENT '总熵值 bits',
    ip_hint              VARCHAR(64)           COMMENT '请求来源 IP（仅用于去重参考，不关联身份）',
    created_at           BIGINT NOT NULL       COMMENT '采集时间戳 ms',

    INDEX idx_full_hash   (full_hash),
    INDEX idx_canvas_hash (canvas_hash),
    INDEX idx_font_hash   (font_hash),
    INDEX idx_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浏览器指纹匿名采集记录';
