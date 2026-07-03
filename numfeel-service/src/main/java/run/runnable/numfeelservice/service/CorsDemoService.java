package run.runnable.numfeelservice.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 「跨域请求限制实验室」业务层。
 * <p>
 * 维护一份演示用的「受害者账户」余额，以及一条可由前端随时切换的 CORS 策略。
 * 策略取值：
 * <ul>
 *   <li>{@link #MODE_DENY}：默认拒绝，响应不带任何 CORS 头，浏览器读不到响应体。</li>
 *   <li>{@link #MODE_ALLOW}：{@code Access-Control-Allow-Origin: *}，允许任意源读取（但不允许携带凭据）。</li>
 *   <li>{@link #MODE_ALLOW_CREDENTIALS}：回显 Origin 并带上 {@code Access-Control-Allow-Credentials: true}，允许携带凭据读取。</li>
 * </ul>
 * 真正的 CORS 头部由 {@code CorsLabFilter} 根据这里的策略写入响应；本类只管「账户」与「策略状态」。
 * <p>
 * 状态全部存内存，重启即重置，避免演示数据污染数据库。
 */
@Service
public class CorsDemoService {

    private static final Logger log = LoggerFactory.getLogger(CorsDemoService.class);

    /** 初始余额（分）。挑一个看着「够偷」的数字：¥99999.00。 */
    public static final int INITIAL_BALANCE_CENTS = 9_999_900;

    /** 默认转账金额（分）：¥100。 */
    public static final int DEFAULT_TRANSFER_CENTS = 10_000;

    public static final String MODE_DENY = "deny";
    public static final String MODE_ALLOW = "allow";
    public static final String MODE_ALLOW_CREDENTIALS = "allow-credentials";

    private final AtomicReference<String> mode = new AtomicReference<>(MODE_DENY);
    private final AtomicInteger balance = new AtomicInteger(INITIAL_BALANCE_CENTS);
    private final List<Map<String, Object>> transfers = new ArrayList<>();

    /** 当前 CORS 策略。 */
    public String currentMode() {
        return mode.get();
    }

    /** 读取「受害者账户」当前状态。 */
    public Mono<Map<String, Object>> getMe() {
        return Mono.just(Map.of(
                "user", "victim-demo-account",
                "balance", balance.get(),
                "currency", "CNY",
                "mode", currentMode()
        ));
    }

    /**
     * 发起一笔转账。CORS 由浏览器执行，请求一旦到达服务端就会真正扣款——
     * 即使前端因为跨域读不到响应，这笔扣款也已经发生。这正是 CSRF 的温床。
     *
     * @param amountCents 转账金额（分），必须大于 0
     * @return 转账结果
     */
    public Mono<Map<String, Object>> transfer(int amountCents) {
        if (amountCents <= 0) {
            return Mono.just(Map.of("executed", false, "message", "amount 必须大于 0"));
        }
        int after = balance.updateAndGet(b -> Math.max(0, b - amountCents));
        String id = "T" + (System.currentTimeMillis() % 100_000);
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("transferId", id);
        entry.put("amount", amountCents);
        entry.put("balanceAfter", after);
        entry.put("at", System.currentTimeMillis());
        synchronized (transfers) {
            transfers.add(entry);
        }
        return Mono.just(Map.of(
                "executed", true,
                "transferId", id,
                "amount", amountCents,
                "balanceAfter", after
        ));
    }

    /** 当前策略与可选项。 */
    public Mono<Map<String, Object>> getPolicy() {
        return Mono.just(Map.of(
                "mode", currentMode(),
                "options", List.of(MODE_DENY, MODE_ALLOW, MODE_ALLOW_CREDENTIALS)
        ));
    }

    /**
     * 切换 CORS 策略。
     *
     * @param next 目标策略，必须是三种合法取值之一
     * @return 切换结果，含切换前后的策略
     */
    public Mono<Map<String, Object>> setPolicy(String next) {
        if (!isValidMode(next)) {
            return Mono.just(Map.of("success", false, "message", "未知策略: " + next));
        }
        String prev = mode.getAndSet(next);
        return Mono.just(Map.of(
                "success", true,
                "mode", next,
                "previous", prev
        ));
    }

    /** 转账流水（用于证明「读不到响应 ≠ 请求没发出」）。 */
    public Mono<Map<String, Object>> listTransfers() {
        List<Map<String, Object>> snapshot;
        synchronized (transfers) {
            snapshot = new ArrayList<>(transfers);
        }
        return Mono.just(Map.of(
                "count", snapshot.size(),
                "transfers", snapshot
        ));
    }

    /** 重置账户：余额归位、清空流水、策略回到 deny。 */
    public Mono<Map<String, Object>> reset() {
        balance.set(INITIAL_BALANCE_CENTS);
        synchronized (transfers) {
            transfers.clear();
        }
        mode.set(MODE_DENY);
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
}
