package run.runnable.numfeelservice.service;

import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.EchoReply;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.HopTiming;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.MethodCallBaseline;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.RpcChainReport;
import run.runnable.numfeelservice.web.ApiException;

/**
 * RPC 链路演示服务。
 * <p>
 * 经 HTTP 串行调用 echo 微服务（numfeel-echo，FastAPI）N 跳并逐跳计时，
 * 同时在同一 JVM 里实测一百万次普通方法调用作为对照组，用来展示
 * 「跨进程 RPC 每跳毫秒级 vs 方法调用纳秒级」的数量级差距。
 * 每跳可注入模拟业务耗时（delay_ms），把"慢下游拖垮整条链路"变成现场可复现的实验。
 */
@Service
public class RpcChainService {

	private static final Logger log = LoggerFactory.getLogger(RpcChainService.class);

	/** 单条链路允许的最大跳数。 */
	static final int MAX_HOPS = 20;

	/** 每跳允许注入的最大模拟耗时（毫秒）。 */
	static final int MAX_DELAY_MS = 500;

	/** 方法调用对照组的采样次数。 */
	private static final int BASELINE_ITERATIONS = 1_000_000;

	/** echo 服务基址，来自配置，生产环境经 Service DNS 内网访问。 */
	private final String echoBaseUrl;

	/** 调用 echo 的 WebClient（10s 响应超时，须大于单跳最大 500ms 注入耗时）。 */
	private final WebClient webClient;

	/**
	 * @param echoBaseUrl echo 服务基址，如 {@code http://numfeel-echo-service...:8100}
	 */
	public RpcChainService(
			@Value("${numfeel.echo.base-url:http://localhost:8100}") String echoBaseUrl) {
		this.echoBaseUrl = echoBaseUrl.endsWith("/")
				? echoBaseUrl.substring(0, echoBaseUrl.length() - 1)
				: echoBaseUrl;
		HttpClient httpClient = HttpClient.create()
				.responseTimeout(Duration.ofSeconds(10));
		this.webClient = WebClient.builder()
				.clientConnector(new ReactorClientHttpConnector(httpClient))
				.build();
	}

	/**
	 * 跑一条 N 跳的 RPC 链并计时。
	 *
	 * @param hops    跳数，1~20
	 * @param delayMs 每跳注入的模拟业务耗时，0~500 毫秒
	 * @return 链路报告：每跳耗时、总耗时与同 JVM 方法调用对照组
	 */
	public Mono<RpcChainReport> runChain(int hops, int delayMs) {
		if (hops < 1 || hops > MAX_HOPS) {
			return Mono.error(ApiException.badRequest(
					"hops 取值 1~" + MAX_HOPS + "，收到 " + hops));
		}
		if (delayMs < 0 || delayMs > MAX_DELAY_MS) {
			return Mono.error(ApiException.badRequest(
					"delayMs 取值 0~" + MAX_DELAY_MS + "，收到 " + delayMs));
		}
		return measureBaseline().flatMap(baseline -> Mono.defer(() -> {
			long startNanos = System.nanoTime();
			return Flux.range(1, hops)
					.concatMap(hop -> timedHop(hop, delayMs))
					.collectList()
					.map(timings -> buildReport(hops, delayMs, startNanos, timings, baseline));
		}));
	}

	/**
	 * 计时单跳：调用前后各取一次 {@code System.nanoTime()}，差值即本跳端到端耗时。
	 *
	 * @param hop     第几跳，从 1 开始
	 * @param delayMs 注入给 echo 的模拟业务耗时（毫秒）
	 * @return 本跳耗时明细
	 */
	private Mono<HopTiming> timedHop(int hop, int delayMs) {
		return Mono.defer(() -> Mono.just(System.nanoTime()))
				.flatMap(startNanos -> callEcho(delayMs)
						.map(reply -> new HopTiming(hop,
								(System.nanoTime() - startNanos) / 1_000_000.0,
								reply.tookUs())));
	}

	/**
	 * 调用 echo 微服务一跳。
	 *
	 * @param delayMs 注入的模拟业务耗时（毫秒）
	 * @return echo 应答（含其自报的内部耗时）
	 */
	private Mono<EchoReply> callEcho(int delayMs) {
		return webClient.get()
				.uri(echoBaseUrl + "/echo?delay_ms=" + delayMs)
				.retrieve()
				.bodyToMono(EchoReply.class)
				.onErrorMap(e -> {
					log.warn("echo 服务调用失败: {}", e.getMessage());
					return new ApiException(502,
							"echo 服务不可达（" + echoBaseUrl + "）: " + e.getMessage());
				});
	}

	/**
	 * 对照组采样。CPU 密集计算，脱离事件循环放到 parallel 调度器。
	 *
	 * @return 方法调用基线（采样次数 + 平均纳秒）
	 */
	private Mono<MethodCallBaseline> measureBaseline() {
		return Mono.fromCallable(() -> new MethodCallBaseline(BASELINE_ITERATIONS, baselineAvgNanos()))
				.subscribeOn(Schedulers.parallel());
	}

	/**
	 * 实测一百万次两参方法调用的平均耗时（纳秒）。
	 * 先热身再计时，累计值参与恒等校验，防止 JIT 把被测方法当死代码优化掉。
	 *
	 * @return 平均每次调用耗时（纳秒）
	 */
	double baselineAvgNanos() {
		long warmup = 0;
		for (int i = 0; i < BASELINE_ITERATIONS / 5; i++) {
			warmup += addTwo(i, i);
		}
		long startNanos = System.nanoTime();
		long acc = 0;
		for (int i = 0; i < BASELINE_ITERATIONS; i++) {
			acc += addTwo(i, i);
		}
		long elapsed = System.nanoTime() - startNanos;
		if (warmup + acc == Long.MIN_VALUE) {
			throw new IllegalStateException("unreachable: blackhole 恒等校验");
		}
		return (double) elapsed / BASELINE_ITERATIONS;
	}

	/** 被测的最小方法：两个 int 相加。 */
	private int addTwo(int a, int b) {
		return a + b;
	}

	/**
	 * 汇总链路报告。
	 *
	 * @param hops       跳数
	 * @param delayMs    每跳注入耗时（毫秒）
	 * @param startNanos 链路起始时间戳（订阅时刻）
	 * @param timings    每跳明细
	 * @param baseline   方法调用对照组
	 * @return 聚合报告
	 */
	private RpcChainReport buildReport(int hops, int delayMs, long startNanos,
			List<HopTiming> timings, MethodCallBaseline baseline) {
		double totalMillis = (System.nanoTime() - startNanos) / 1_000_000.0;
		double upstreamMillis = timings.stream().mapToLong(HopTiming::upstreamUs).sum() / 1000.0;
		double avgHopMillis = timings.stream().mapToDouble(HopTiming::millis).average().orElse(0);
		return new RpcChainReport(hops, delayMs, totalMillis, avgHopMillis,
				Math.max(0, totalMillis - upstreamMillis), List.copyOf(timings), baseline);
	}
}
