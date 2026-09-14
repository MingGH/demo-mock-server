package run.runnable.numfeelservice.controller.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * RPC 链路演示（rpc-chain）的响应 DTO 集合。
 * <p>
 * 演示命题：跨进程 RPC 的每一跳毫秒级开销 vs 同 JVM 方法调用的纳秒级开销。
 * {@link EchoReply} 同时充当 echo 微服务（numfeel-echo）应答 JSON 的反序列化载体，
 * 字段名与 Python 侧 snake_case 一一对应。
 */
public final class RpcChainResponses {

	private RpcChainResponses() {
	}

	/**
	 * echo 服务单次应答。
	 *
	 * @param service 服务标识，恒为 numfeel-echo
	 * @param delayMs 本次请求模拟的业务处理耗时（毫秒）
	 * @param tookUs  echo 侧 handler 入口到返回的总耗时（微秒，含模拟业务处理）
	 * @param sleptUs tookUs 中纯 asyncio.sleep 的部分（微秒），两者之差即 Python 侧框架开销
	 */
	public record EchoReply(
			/** 服务标识，恒为 numfeel-echo。 */
			String service,
			/** 本次请求模拟的业务处理耗时（毫秒）。 */
			@JsonProperty("delay_ms") int delayMs,
			/** echo 侧 handler 入口到返回的总耗时（微秒，含模拟业务处理）。 */
			@JsonProperty("took_us") long tookUs,
			/** tookUs 中纯 asyncio.sleep 的部分（微秒）。 */
			@JsonProperty("slept_us") long sleptUs) {
	}

	/**
	 * 单跳 RPC 的耗时拆解。
	 *
	 * @param hop        第几跳，从 1 开始
	 * @param millis     本跳端到端耗时（毫秒，含网络往返、双向序列化与上游处理）
	 * @param upstreamUs echo 服务自报的内部处理耗时（微秒）
	 */
	public record HopTiming(
			/** 第几跳，从 1 开始。 */
			int hop,
			/** 本跳端到端耗时（毫秒，含网络往返、双向序列化与上游处理）。 */
			double millis,
			/** echo 服务自报的内部处理耗时（微秒）。 */
			long upstreamUs) {
	}

	/**
	 * 对照组：同一 JVM 内普通方法调用的耗时。
	 *
	 * @param iterations 采样调用次数
	 * @param avgNanos   平均每次调用耗时（纳秒）
	 */
	public record MethodCallBaseline(
			/** 采样调用次数。 */
			int iterations,
			/** 平均每次调用耗时（纳秒）。 */
			double avgNanos) {
	}

	/**
	 * /demo/rpc-chain 的聚合报告。
	 *
	 * @param hops               实际执行的跳数
	 * @param delayMs            每跳注入的模拟业务耗时（毫秒）
	 * @param totalMillis        整条链路端到端总耗时（毫秒）
	 * @param avgHopMillis       每跳平均耗时（毫秒）
	 * @param overheadMillis     链路开销合计（毫秒）：总耗时减去上游自报处理耗时，即网络 + 双向序列化 + 框架
	 * @param hopTimings         每跳耗时明细（按跳数升序）
	 * @param methodCallBaseline 对照组：同 JVM 方法调用平均耗时
	 */
	public record RpcChainReport(
			/** 实际执行的跳数。 */
			int hops,
			/** 每跳注入的模拟业务耗时（毫秒）。 */
			int delayMs,
			/** 整条链路端到端总耗时（毫秒）。 */
			double totalMillis,
			/** 每跳平均耗时（毫秒）。 */
			double avgHopMillis,
			/** 链路开销合计（毫秒）：总耗时减上游自报处理耗时。 */
			double overheadMillis,
			/** 每跳耗时明细（按跳数升序）。 */
			List<HopTiming> hopTimings,
			/** 对照组：同 JVM 方法调用平均耗时。 */
			MethodCallBaseline methodCallBaseline) {
	}
}
