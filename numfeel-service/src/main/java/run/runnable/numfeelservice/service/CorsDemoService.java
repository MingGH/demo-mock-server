package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 「跨域请求限制实验室」业务层。
 * <p>
 * 每个访客在 {@code POST /cors-lab/session} 时拿到一个 UUID token，对应一份独立的
 * 「受害者账户」状态：余额、CORS 策略、转账流水。状态存 Caffeine 缓存，30 分钟过期，
 * 互不影响——避免访客 A 切策略 / 转账干扰访客 B 的实验。
 * <p>
 * 策略取值：
 * <ul>
 *   <li>{@link #MODE_DENY}：默认拒绝，响应不带任何 CORS 头，浏览器读不到响应体。</li>
 *   <li>{@link #MODE_ALLOW}：{@code Access-Control-Allow-Origin: *}，允许任意源读取（但不允许携带凭据）。</li>
 *   <li>{@link #MODE_ALLOW_CREDENTIALS}：回显 Origin 并带上 {@code Access-Control-Allow-Credentials: true}，允许携带凭据读取。</li>
 * </ul>
 * 真正的 CORS 头部由 {@code CorsLabFilter} 根据会话策略写入响应。
 */
@Service
public class CorsDemoService {

    /** 初始余额（分）。挑一个看着「够偷」的数字：¥99999.00。 */
    public static final int INITIAL_BALANCE_CENTS = 9_999_900;

    /** 默认转账金额（分）：¥100。 */
    public static final int DEFAULT_TRANSFER_CENTS = 10_000;

    public static final String MODE_DENY = "deny";
    public static final String MODE_ALLOW = "allow";
    public static final String MODE_ALLOW_CREDENTIALS = "allow-credentials";

    /** 单个会话的存活时间。 */
    private static final long TTL_MINUTES = 30;

    /** token → 会话状态。 */
    private final Cache<String, SessionState> sessions = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(TTL_MINUTES, TimeUnit.MINUTES)
            .build();

    /** 单个会话的可变状态。 */
    static final class SessionState {
        final AtomicInteger balance = new AtomicInteger(INITIAL_BALANCE_CENTS);
        final AtomicReference<String> mode = new AtomicReference<>(MODE_DENY);
        final List<Map<String, Object>> transfers = Collections.synchronizedList(new ArrayList<>());
    }

    private SessionState stateFor(String token) {
        return token == null ? null : sessions.getIfPresent(token);
    }

    /** 创建新会话：返回 token 与初始状态。 */
    public Mono<Map<String, Object>> createSession() {
        String token = UUID.randomUUID().toString().replace("-", "");
        sessions.put(token, new SessionState());
        return Mono.just(Map.of(
                "token", token,
                "balance", INITIAL_BALANCE_CENTS,
                "mode", MODE_DENY,
                "ttlSeconds", TTL_MINUTES * 60
        ));
    }

    /** 当前策略（供 CorsLabFilter 查询；会话失效时按 deny 处理，请求会被拦下）。 */
    public String currentMode(String token) {
        SessionState s = stateFor(token);
        return s == null ? MODE_DENY : s.mode.get();
    }

    /** 读取「受害者账户」当前状态。 */
    public Mono<Map<String, Object>> getMe(String token) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        return Mono.just(Map.of(
                "user", "victim-demo-account",
                "balance", s.balance.get(),
                "currency", "CNY",
                "mode", s.mode.get()
        ));
    }

    /**
     * 发起一笔转账。CORS 由浏览器执行，请求一旦到达服务端就会真正扣款——
     * 即使前端因为跨域读不到响应，这笔扣款也已经发生。这正是 CSRF 的温床。
     *
     * @param token       会话 token
     * @param amountCents 转账金额（分），必须大于 0
     * @return 转账结果
     */
    public Mono<Map<String, Object>> transfer(String token, int amountCents) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        if (amountCents <= 0) {
            return Mono.just(Map.of("executed", false, "message", "amount 必须大于 0"));
        }
        int after = s.balance.updateAndGet(b -> Math.max(0, b - amountCents));
        String id = "T" + (System.currentTimeMillis() % 100_000);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("transferId", id);
        entry.put("amount", amountCents);
        entry.put("balanceAfter", after);
        entry.put("at", System.currentTimeMillis());
        s.transfers.add(entry);
        return Mono.just(Map.of(
                "executed", true,
                "transferId", id,
                "amount", amountCents,
                "balanceAfter", after
        ));
    }

    /** 当前策略与可选项。 */
    public Mono<Map<String, Object>> getPolicy(String token) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        return Mono.just(Map.of(
                "mode", s.mode.get(),
                "options", List.of(MODE_DENY, MODE_ALLOW, MODE_ALLOW_CREDENTIALS)
        ));
    }

    /**
     * 切换 CORS 策略。
     *
     * @param token 会话 token
     * @param next  目标策略，必须是三种合法取值之一
     * @return 切换结果，含切换前后的策略
     */
    public Mono<Map<String, Object>> setPolicy(String token, String next) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        if (!isValidMode(next)) {
            return Mono.just(Map.of("success", false, "message", "未知策略: " + next));
        }
        String prev = s.mode.getAndSet(next);
        return Mono.just(Map.of(
                "success", true,
                "mode", next,
                "previous", prev
        ));
    }

    /** 转账流水（用于证明「读不到响应 ≠ 请求没发出」）。 */
    public Mono<Map<String, Object>> listTransfers(String token) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        List<Map<String, Object>> snapshot;
        synchronized (s.transfers) {
            snapshot = new ArrayList<>(s.transfers);
        }
        return Mono.just(Map.of(
                "count", snapshot.size(),
                "transfers", snapshot
        ));
    }

    /** 重置账户：余额归位、清空流水、策略回到 deny。 */
    public Mono<Map<String, Object>> reset(String token) {
        SessionState s = stateFor(token);
        if (s == null) {
            return Mono.just(expired());
        }
        s.balance.set(INITIAL_BALANCE_CENTS);
        s.transfers.clear();
        s.mode.set(MODE_DENY);
        return Mono.just(Map.of(
                "success", true,
                "balance", INITIAL_BALANCE_CENTS,
                "mode", MODE_DENY,
                "transfersCleared", true
        ));
    }

    private static boolean isValidMode(String m) {
        return MODE_DENY.equals(m) || MODE_ALLOW.equals(m) || MODE_ALLOW_CREDENTIALS.equals(m);
    }

    private static Map<String, Object> expired() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("expired", true);
        m.put("message", "session 已过期，请刷新页面");
        return m;
    }
}
