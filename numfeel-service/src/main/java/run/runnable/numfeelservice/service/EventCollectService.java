package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.EventRequests.EventItem;
import run.runnable.numfeelservice.controller.dto.EventResponses.EventCollectResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 通用行为埋点 — 批量摄入业务逻辑。
 * <p>
 * 所有 demo 共用 {@code demo_events} 一张表。前端是 fire-and-forget 上报，
 * 坏数据按条丢弃而不是整批拒绝（除了 demo / sessionId 这两个在 controller 层校验的字段）。
 */
@Service
public class EventCollectService {

    private static final Logger log = LoggerFactory.getLogger(EventCollectService.class);

    /** 事件名规则：小写字母开头，允许小写字母/数字/下划线，最长 48。 */
    private static final Pattern EVENT_NAME_PATTERN = Pattern.compile("^[a-z][a-z0-9_]{0,47}$");

    /** props 最多保留的 key 数量。 */
    private static final int MAX_PROPS_KEYS = 20;

    /** props 序列化后允许的最大字节数。 */
    private static final int MAX_PROPS_BYTES = 1024;

    /** props 中字符串值允许的最大长度。 */
    private static final int MAX_PROPS_STRING_LENGTH = 64;

    /** 单批次允许的最大事件数，超出直接截断（不拒绝整批）。 */
    public static final int MAX_EVENTS_PER_BATCH = 100;

    /** client_ts 与服务端时间偏差超过该值则置 0。 */
    private static final long MAX_CLIENT_TS_SKEW_MS = 24L * 60 * 60 * 1000;

    private static final DateTimeFormatter DAY_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final DatabaseClient databaseClient;
    private final boolean enabled;
    private final String salt;

    public EventCollectService(
            DatabaseClient databaseClient,
            @Value("${numfeel.events.enabled:true}") boolean enabled,
            @Value("${numfeel.events.salt}") String salt) {
        this.databaseClient = databaseClient;
        this.enabled = enabled;
        this.salt = salt;
    }

    /**
     * 批量摄入一个会话上报的事件。
     *
     * @param demo demo slug（已在 controller 层完成格式校验）
     * @param sessionId 会话 ID（已在 controller 层完成格式校验）
     * @param events 本批次事件（已在 controller 层截断到 {@link #MAX_EVENTS_PER_BATCH} 条以内）
     * @param clientIp 客户端真实 IP，仅用于计算 ip_hash，不落库原始值
     * @return 接受与丢弃的事件数
     */
    public Mono<EventCollectResponse> collect(String demo, String sessionId, List<EventItem> events, String clientIp) {
        if (!enabled) {
            return Mono.just(new EventCollectResponse(0, 0));
        }
        if (events == null || events.isEmpty()) {
            return Mono.just(new EventCollectResponse(0, 0));
        }

        long now = System.currentTimeMillis();
        String ipHash = computeIpHash(clientIp, now);

        List<Object[]> rows = new ArrayList<>();
        int dropped = 0;
        for (EventItem item : events) {
            Object[] row = toRow(demo, sessionId, item, now, ipHash);
            if (row == null) {
                dropped++;
            } else {
                rows.add(row);
            }
        }

        if (rows.isEmpty()) {
            return Mono.just(new EventCollectResponse(0, dropped));
        }

        int accepted = rows.size();
        int finalDropped = dropped;
        return batchInsert(rows)
                .thenReturn(new EventCollectResponse(accepted, finalDropped))
                .onErrorResume(err -> {
                    log.warn("demo_events batch insert failed: {}", err.getMessage());
                    return Mono.just(new EventCollectResponse(0, accepted + finalDropped));
                });
    }

    /**
     * 校验并清洗单条事件，转换为可绑定到 INSERT 语句的参数数组；不合法返回 {@code null}。
     */
    private Object[] toRow(String demo, String sessionId, EventItem item, long now, String ipHash) {
        if (item == null || item.name() == null || !EVENT_NAME_PATTERN.matcher(item.name()).matches()) {
            return null;
        }
        int seq = item.seq() != null ? item.seq() : 0;
        long clientTs = normalizeClientTs(item.t(), now);
        String propsJson = serializeProps(cleanProps(item.props()));

        return new Object[]{demo, item.name(), sessionId, seq, propsJson, clientTs, now, ipHash};
    }

    /**
     * 规范化客户端时间：缺省为 0；与服务端时间偏差超过 {@link #MAX_CLIENT_TS_SKEW_MS} 时置 0。
     *
     * @param clientTs 客户端上报的时间（毫秒），可为空
     * @param serverNow 服务端当前时间（毫秒）
     * @return 规范化后的 client_ts
     */
    static long normalizeClientTs(Long clientTs, long serverNow) {
        if (clientTs == null) {
            return 0L;
        }
        if (Math.abs(serverNow - clientTs) > MAX_CLIENT_TS_SKEW_MS) {
            return 0L;
        }
        return clientTs;
    }

    /**
     * 清洗事件属性：仅保留 number / boolean / 短字符串值，最多 {@link #MAX_PROPS_KEYS} 个 key，
     * 且逐步添加时确保序列化后不超过 {@link #MAX_PROPS_BYTES} 字节。
     *
     * @param raw 原始属性 map，可为 {@code null}
     * @return 清洗后的属性 map；没有可用属性时返回空 map
     */
    static Map<String, Object> cleanProps(Map<String, Object> raw) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (raw == null || raw.isEmpty()) {
            return result;
        }
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            if (result.size() >= MAX_PROPS_KEYS) {
                break;
            }
            String key = entry.getKey();
            Object value = entry.getValue();
            if (key == null || key.isBlank()) {
                continue;
            }
            Object cleanedValue = cleanValue(value);
            if (cleanedValue == null) {
                continue;
            }
            Map<String, Object> candidate = new LinkedHashMap<>(result);
            candidate.put(key, cleanedValue);
            if (serializedByteLength(candidate) > MAX_PROPS_BYTES) {
                // 加入这个 key 会超限，跳过它但继续尝试后面更小的 key
                continue;
            }
            result.put(key, cleanedValue);
        }
        return result;
    }

    /** 仅允许 Number / Boolean / 长度 ≤64 的 String；其他类型（嵌套对象、数组等）返回 {@code null} 表示丢弃。 */
    private static Object cleanValue(Object value) {
        if (value instanceof Number || value instanceof Boolean) {
            return value;
        }
        if (value instanceof String str) {
            return str.length() <= MAX_PROPS_STRING_LENGTH ? str : null;
        }
        return null;
    }

    private static int serializedByteLength(Map<String, Object> map) {
        try {
            return MAPPER.writeValueAsString(map).getBytes(StandardCharsets.UTF_8).length;
        } catch (Exception e) {
            return Integer.MAX_VALUE;
        }
    }

    private static String serializeProps(Map<String, Object> props) {
        if (props == null || props.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(props);
        } catch (Exception e) {
            log.warn("failed to serialize event props: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 计算 ip_hash = SHA-256(ip + 当日UTC日期 + 盐) 的前 16 位十六进制。
     * <p>
     * 使用按日轮换的盐，跨天无法关联同一 IP，仅用于短期防刷。
     */
    String computeIpHash(String clientIp, long nowMs) {
        String ip = clientIp == null ? "unknown" : clientIp;
        String day = DAY_FORMATTER.format(Instant.ofEpochMilli(nowMs));
        String hash = sha256(ip + day + salt);
        return hash.substring(0, Math.min(16, hash.length()));
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hashBytes) {
                String h = Integer.toHexString(0xff & b);
                if (h.length() == 1) hex.append('0');
                hex.append(h);
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    /** 一次请求一条批量 INSERT SQL，不循环单条插入。 */
    private Mono<Long> batchInsert(List<Object[]> rows) {
        StringBuilder sql = new StringBuilder(
                "INSERT INTO demo_events (demo_slug, event_name, session_id, seq, props, client_ts, created_at, ip_hash) VALUES ");
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("(?,?,?,?,?,?,?,?)");
        }

        DatabaseClient.GenericExecuteSpec spec = databaseClient.sql(sql.toString());
        int paramIndex = 0;
        for (Object[] row : rows) {
            for (Object value : row) {
                spec = value == null ? spec.bindNull(paramIndex, String.class) : spec.bind(paramIndex, value);
                paramIndex++;
            }
        }
        return spec.fetch().rowsUpdated();
    }
}
