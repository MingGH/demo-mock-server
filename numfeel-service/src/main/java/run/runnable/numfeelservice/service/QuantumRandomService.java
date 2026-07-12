package run.runnable.numfeelservice.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import tools.jackson.databind.node.ArrayNode;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 真随机熵源服务：熵源链 + 字节池缓存 + 无偏抽取。
 * <p>
 * 熵源链（按可预测性递增）：
 * 1. {@code quantum}——真空量子涨落 ANU QRNG（{@link #ninjaApiWebClient}）。
 * 2. {@code atmospheric}——大气噪声，random.org 公开整数接口（{@link #randomOrgWebClient}）。
 * 3. {@code secure}——本地 {@link SecureRandom}（CSPRNG，诚实标注非真随机）。
 * <p>
 * 诚实标注：被降级时 {@link Entropy#degraded} 为 true，前端据此显示徽章，绝不谎称量子。
 */
@Service
public class QuantumRandomService {

    private static final Logger log = LoggerFactory.getLogger(QuantumRandomService.class);

    public static final String SOURCE_QUANTUM = "quantum";
    public static final String SOURCE_ATMOSPHERIC = "atmospheric";
    public static final String SOURCE_SECURE = "secure";

    private static final int MIN_BATCH = 1024;
    private static final int MAX_BYTES = 8192;
    private static final int POOL_CAP = 8192;

    private final WebClient ninjaApiWebClient;
    private final WebClient randomOrgWebClient;
    private final String ninjaApiToken;
    private final SecureRandom secureRandom = new SecureRandom();

    /** 字节池：按 source 维护一段已取到的随机字节，避免每次请求都打上游。 */
    private final Cache<String, Deque<Integer>> bytePool = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(5))
            .maximumSize(16)
            .build();

    /** 统计用：上游成功/失败次数。仅作可观测性指标。 */
    private final AtomicLong quantumHits = new AtomicLong();
    private final AtomicLong atmosphericHits = new AtomicLong();
    private final AtomicLong secureHits = new AtomicLong();
    private final AtomicLong fallbackEvents = new AtomicLong();

    /**
     * 构造服务。
     *
     * @param ninjaApiWebClient 代理 api.996.ninja 的 WebClient（量子源）
     * @param randomOrgWebClient random.org 的 WebClient（大气噪声源）
     * @param ninjaApiToken api.996.ninja 鉴权 token（环境变量注入）
     */
    public QuantumRandomService(@Qualifier("ninjaApiWebClient") WebClient ninjaApiWebClient,
                                @Qualifier("randomOrgWebClient") WebClient randomOrgWebClient,
                                @Value("${ninja.api.token:}") String ninjaApiToken) {
        this.ninjaApiWebClient = ninjaApiWebClient;
        this.randomOrgWebClient = randomOrgWebClient;
        this.ninjaApiToken = ninjaApiToken;
        if (ninjaApiToken == null || ninjaApiToken.isBlank()) {
            log.warn("NINJA_API_TOKEN (ninja.api.token) 未配置，量子源将走不通，会自动降级");
        }
    }

    /** 一段取自某熵源的真随机字节，附带来源与诚实降级标注。 */
    public record Entropy(List<Integer> bytes, String source, String provider, boolean degraded, String requestedSource) {
    }

    /**
     * 取一段真随机字节。{@code requestedSource} 为 null/空时按 quantum→atmospheric→secure 链降级；
     * 指定具体源时只走该源，失败仍降级到 secure，并标注 degraded=true。
     *
     * @param count 需要的字节数（1–8192）
     * @param requestedSource 期望熵源：quantum / atmospheric / secure / null
     * @return 取到的字节与来源信息
     */
    public Mono<Entropy> bytes(int count, String requestedSource) {
        int n = Math.max(1, Math.min(count, MAX_BYTES));
        String want = normalizeSource(requestedSource);
        return resolveFromPool(n, want)
                .flatMap(poolHit -> {
                    if (poolHit.satisfied) {
                        return Mono.just(new Entropy(poolHit.bytes, poolHit.actualSource, poolHit.provider,
                                !sameSource(want, poolHit.actualSource), want));
                    }
                    // 池里不够，按链补
                    return fetchChain(want, n)
                            .map(fetched -> {
                                // 多取的留进池
                                if (fetched.bytes.size() > n) {
                                    stashPool(fetched.source, fetched.provider, fetched.bytes.subList(n, fetched.bytes.size()));
                                }
                                List<Integer> dispense = fetched.bytes.size() >= n
                                        ? fetched.bytes.subList(0, n) : fetched.bytes;
                                return new Entropy(dispense, fetched.source, fetched.provider,
                                        !sameSource(want, fetched.source), want);
                            });
                });
    }

    // ── 池操作 ──
    private record PoolHit(boolean satisfied, List<Integer> bytes, String actualSource, String provider) {
    }

    private Mono<PoolHit> resolveFromPool(int n, String want) {
        Deque<Integer> pool = bytePool.getIfPresent(poolKey(want));
        if (pool != null && pool.size() >= n) {
            List<Integer> taken = new ArrayList<>(n);
            synchronized (pool) {
                for (int i = 0; i < n; i++) taken.add(pool.poll());
            }
            // 池中字节记不得 provider 元信息，统一用"上游缓存"
            return Mono.just(new PoolHit(true, taken, want, providerOf(want) + "（字节池缓存）"));
        }
        if (pool != null && !pool.isEmpty()) {
            // 不够 n，先把池里全用掉再补差——简化起见直接补：清池重新拉
            synchronized (pool) { pool.clear(); }
        }
        return Mono.just(new PoolHit(false, List.of(), want, ""));
    }

    private void stashPool(String source, String provider, List<Integer> extra) {
        if (extra == null || extra.isEmpty()) return;
        String key = poolKey(source);
        Deque<Integer> pool = bytePool.get(key, k -> new ArrayDeque<>());
        synchronized (pool) {
            for (Integer b : extra) {
                if (pool.size() >= POOL_CAP) break;
                pool.add(b);
            }
        }
    }

    private String poolKey(String source) {
        return "pool:" + source;
    }

    // ── 熵源链 ──
    private record Fetched(List<Integer> bytes, String source, String provider) {
    }

    private Mono<Fetched> fetchChain(String want, int count) {
        // 指定 secure 直接本地取
        if (SOURCE_SECURE.equals(want)) return secureBytes(count).map(b -> new Fetched(b, SOURCE_SECURE, providerOf(SOURCE_SECURE)));
        // 指定 atmospheric 则 quantum 不参与
        if (SOURCE_ATMOSPHERIC.equals(want)) {
            return fetchAtmospheric(count)
                    .map(b -> { atmosphericHits.incrementAndGet(); return new Fetched(b, SOURCE_ATMOSPHERIC, providerOf(SOURCE_ATMOSPHERIC)); })
                    .onErrorResume(e -> {
                        log.warn("atmospheric 降级到 secure: {}", e.getMessage());
                        fallbackEvents.incrementAndGet();
                        return secureBytes(count).map(b -> new Fetched(b, SOURCE_SECURE, providerOf(SOURCE_SECURE)));
                    });
        }
        // 默认量子链：quantum → atmospheric → secure
        return fetchQuantum(Math.max(count, MIN_BATCH))
                .map(b -> {
                    quantumHits.incrementAndGet();
                    return new Fetched(b, SOURCE_QUANTUM, providerOf(SOURCE_QUANTUM));
                })
                .onErrorResume(qe -> {
                    log.warn("quantum 降级到 atmospheric: {}", qe.getMessage());
                    fallbackEvents.incrementAndGet();
                    return fetchAtmospheric(Math.max(count, MIN_BATCH))
                            .map(b -> {
                                atmosphericHits.incrementAndGet();
                                return new Fetched(b, SOURCE_ATMOSPHERIC, providerOf(SOURCE_ATMOSPHERIC));
                            })
                            .onErrorResume(ae -> {
                                log.warn("atmospheric 降级到 secure: {}", ae.getMessage());
                                fallbackEvents.incrementAndGet();
                                return secureBytes(count).map(b -> new Fetched(b, SOURCE_SECURE, providerOf(SOURCE_SECURE)));
                            });
                });
    }

    private Mono<List<Integer>> fetchQuantum(int count) {
        int safe = Math.max(1, Math.min(count, 2000));
        if (ninjaApiToken == null || ninjaApiToken.isBlank()) {
            return Mono.error(new IllegalStateException("量子源未配置 token"));
        }
        return ninjaApiWebClient.get()
                .uri(uriBuilder -> uriBuilder.path("/random/numbers")
                        .queryParam("count", safe)
                        .queryParam("min", 0)
                        .queryParam("max", 255)
                        .build())
                .header("X-Api-Token", ninjaApiToken)
                .retrieve()
                .bodyToMono(ArrayNode.class)
                .map(arr -> {
                    List<Integer> out = new ArrayList<>(arr.size());
                    for (int i = 0; i < arr.size(); i++) out.add(arr.get(i).asInt());
                    return out;
                });
    }

    private Mono<List<Integer>> fetchAtmospheric(int count) {
        int safe = Math.max(1, Math.min(count, 1000));
        return randomOrgWebClient.get()
                .uri(uriBuilder -> uriBuilder.path("/integers/")
                        .queryParam("num", safe)
                        .queryParam("min", 0)
                        .queryParam("max", 255)
                        .queryParam("col", 1)
                        .queryParam("base", 10)
                        .queryParam("format", "plain")
                        .queryParam("rnd", "new")
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(body -> {
                    String[] lines = body.split("\\s+");
                    List<Integer> out = new ArrayList<>(lines.length);
                    for (String line : lines) {
                        String t = line.trim();
                        if (!t.isEmpty()) {
                            try { out.add(Integer.parseInt(t) & 0xff); } catch (NumberFormatException ignore) { }
                        }
                    }
                    if (out.isEmpty()) throw new IllegalStateException("random.org 返回空");
                    return out;
                });
    }

    private Mono<List<Integer>> secureBytes(int count) {
        secureHits.incrementAndGet();
        return Mono.fromCallable(() -> {
            List<Integer> out = new ArrayList<>(count);
            byte[] buf = new byte[count];
            secureRandom.nextBytes(buf);
            for (byte b : buf) out.add(b & 0xff);
            return out;
        });
    }

    // ── 工具 ──
    private String normalizeSource(String src) {
        if (src == null || src.isBlank()) return SOURCE_QUANTUM;
        String s = src.trim().toLowerCase();
        if (s.equals(SOURCE_QUANTUM) || s.equals(SOURCE_ATMOSPHERIC) || s.equals(SOURCE_SECURE)) return s;
        return SOURCE_QUANTUM;
    }

    private boolean sameSource(String want, String actual) {
        String w = want == null || want.isBlank() ? SOURCE_QUANTUM : want;
        return w.equals(actual);
    }

    private String providerOf(String source) {
        return switch (source) {
            case SOURCE_QUANTUM -> "ANU QRNG（测量真空量子涨落）";
            case SOURCE_ATMOSPHERIC -> "random.org（大气噪声）";
            case SOURCE_SECURE -> "本地 SecureRandom（CSPRNG，非真随机）";
            default -> "";
        };
    }

    /** 可观测性指标：返回各源命中与降级次数。仅供排障/展示。 */
    public java.util.Map<String, Long> stats() {
        return java.util.Map.of(
                "quantumHits", quantumHits.get(),
                "atmosphericHits", atmosphericHits.get(),
                "secureHits", secureHits.get(),
                "fallbackEvents", fallbackEvents.get());
    }

    // ────────────────────────────────────────────────────────────
    // 字节 → 号码：无偏抽取（拒绝采样 + Fisher–Yates）
    // 与前端 logic.js 完全同构，单测覆盖。
    // ────────────────────────────────────────────────────────────

    /**
     * 摇一注彩票。
     *
     * @param type 玩法："ssq"（双色球）或 "dlt"（大乐透）
     * @param source 熵源；留空走量子优先链
     * @return 红球/蓝球或前/后区 + 来源信息
     */
    public Mono<LotteryDraw> drawLottery(String type, String source) {
        String t = type == null ? "" : type.trim().toLowerCase();
        int need = 256;
        return bytes(need, source).map(e -> {
            List<Integer> bs = takeBytes(e);
            int[] idx = {0};
            return switch (t) {
                case "ssq" -> new LotteryDraw("ssq",
                        pickUniqueShared(bs, idx, 6, 1, 33),
                        drawIntShared(bs, idx, 16) + 1, null, null,
                        e.source, e.provider, e.degraded);
                case "dlt" -> new LotteryDraw("dlt", null, null,
                        pickUniqueShared(bs, idx, 5, 1, 35),
                        pickUniqueShared(bs, idx, 2, 1, 12),
                        e.source, e.provider, e.degraded);
                default -> throw new IllegalArgumentException("type 只能是 ssq 或 dlt");
            };
        });
    }

    /**
     * 生成固定位数或区间无偏随机数。
     *
     * @param length 固定位数模式位数（1–20）
     * @param min 区间最小值（含）
     * @param max 区间最大值（含）
     * @param count 区间模式生成个数
     * @param source 熵源
     * @return 数字字符串（固定位数模式）或整数列表（区间模式）
     */
    public Mono<DigitsDraw> drawDigits(int length, int min, int max, int count, String source) {
        boolean rangeMode = min != Integer.MIN_VALUE && max != Integer.MIN_VALUE && min <= max;
        if (rangeMode) {
            if (count < 1 || count > 100) throw new IllegalArgumentException("count 须在 1..100");
            int range = max - min + 1;
            if (range <= 0) throw new IllegalArgumentException("min/max 非法");
            return bytes(256, source).map(e -> {
                List<Integer> bs = takeBytes(e);
                int[] idx = {0};
                List<Integer> vals = new ArrayList<>();
                for (int i = 0; i < count; i++) {
                    Integer v = drawIntShared(bs, idx, range);
                    if (v == null) v = secureRandom.nextInt(range);
                    vals.add(v + min);
                }
                return new DigitsDraw(vals, null, e.source, e.provider, e.degraded);
            });
        }
        if (length < 1 || length > 20) throw new IllegalArgumentException("length 须在 1..20");
        return bytes(256, source).map(e -> {
            List<Integer> bs = takeBytes(e);
            int[] idx = {0};
            Integer first = drawIntShared(bs, idx, 9);
            if (first == null) first = secureRandom.nextInt(9);
            StringBuilder sb = new StringBuilder().append(first + 1);
            for (int i = 1; i < length; i++) {
                Integer d = drawIntShared(bs, idx, 10);
                if (d == null) d = secureRandom.nextInt(10);
                sb.append(d);
            }
            return new DigitsDraw(null, sb.toString(), e.source, e.provider, e.degraded);
        });
    }

    /** 彩票抽取结果。 */
    public record LotteryDraw(String type, List<Integer> red, Integer blue,
                              List<Integer> front, List<Integer> back,
                              String source, String provider, boolean degraded) {
    }

    /** 固定位数/区间抽取结果。 */
    public record DigitsDraw(List<Integer> values, String value,
                             String source, String provider, boolean degraded) {
    }

    /** 从 Entropy 取可变 list。 */
    private List<Integer> takeBytes(Entropy e) {
        return new ArrayList<>(e.bytes());
    }

    /**
     * 用随机字节无偏抽 [min,max] 内 count 个不重复号码（Fisher–Yates + 拒绝采样）。
     * 字节不足时用 SecureRandom 补足，保证一定能出结果。游标 idx 跨调用延续。
     */
    private List<Integer> pickUniqueShared(List<Integer> bytes, int[] idx, int count, int min, int max) {
        int pool = max - min + 1;
        if (count > pool) throw new IllegalArgumentException("count 超过可选范围");
        List<Integer> candidates = new ArrayList<>(pool);
        for (int i = min; i <= max; i++) candidates.add(i);
        List<Integer> picked = new ArrayList<>();
        for (int pickedSoFar = 0; pickedSoFar < count; pickedSoFar++) {
            int remaining = candidates.size();
            Integer r = drawIntShared(bytes, idx, remaining);
            if (r == null) r = secureRandom.nextInt(remaining); // 字节耗尽兜底
            picked.add(candidates.get(r));
            candidates.set(r, candidates.get(remaining - 1));
            candidates.remove(remaining - 1);
        }
        picked.sort(Integer::compare);
        return picked;
    }

    /**
     * 用字节无偏取 [0, range) 的整数（拒绝采样 + 自适应窗口）。
     */
    private Integer drawIntShared(List<Integer> bytes, int[] idx, int range) {
        if (range <= 1) return 0;
        int w = windowForRange(range);
        long span = 1L;
        for (int i = 0; i < w; i++) span *= 256;
        long limit = span - (span % range);
        if (limit == 0) limit = span;
        int guard = 0;
        while (idx[0] + w <= bytes.size()) {
            long n = 0;
            for (int k = 0; k < w; k++) n = n * 256 + (bytes.get(idx[0] + k) & 0xff);
            idx[0] += w;
            if (n < limit) return (int) (n % range);
            if (++guard > 4096) return null;
        }
        return null;
    }

    private int drawUniform(List<Integer> bytes, int min, int range) {
        int[] idx = {0};
        Integer v = drawIntShared(bytes, idx, range);
        if (v == null) v = secureRandom.nextInt(range);
        return v;
    }

    private int windowForRange(int range) {
        int w = 1;
        long cap = 256;
        while (cap < range && w < 8) { w++; cap *= 256; }
        return w;
    }
}