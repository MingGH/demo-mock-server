CREATE TABLE IF NOT EXISTS dht_peers (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    infohash    VARCHAR(40)  NOT NULL COMMENT 'Torrent infohash (hex)',
    ip          VARCHAR(45)  NOT NULL COMMENT 'Peer IP address',
    port        INT          NOT NULL COMMENT 'Peer port',
    country     VARCHAR(64)  NULL     COMMENT 'GeoIP country name',
    country_code VARCHAR(2)  NULL     COMMENT 'ISO country code',
    city        VARCHAR(128) NULL     COMMENT 'GeoIP city',
    lat         DOUBLE       NULL     COMMENT 'Latitude',
    lng         DOUBLE       NULL     COMMENT 'Longitude',
    torrent_name VARCHAR(256) NOT NULL COMMENT 'Human-readable torrent name',
    discovered_at BIGINT     NOT NULL COMMENT 'Unix timestamp (ms) when discovered',
    INDEX idx_infohash (infohash),
    INDEX idx_discovered (discovered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DHT peer discovery cache for P2P privacy demo';
