package run.runnable.numfeelservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.RpcChainResponses.RpcChainReport;
import run.runnable.numfeelservice.service.RpcChainService;
import run.runnable.numfeelservice.web.ApiEnvelope;

/**
 * RPC 链路演示接口。
 * <p>
 * GET /demo/rpc-chain —— 本服务经 HTTP 串行调用 echo 微服务 N 跳并逐跳计时，
 * 用真实跨进程数字对照「方法调用纳秒级 vs RPC 毫秒级」，支撑
 * 知乎回答《javaer总是说有分布式了，单体性能就不重要了，这种说法对吗？》的核心论据。
 */
@RestController
@RequestMapping("/demo")
public class RpcChainController {

	private final RpcChainService service;

	public RpcChainController(RpcChainService service) {
		this.service = service;
	}

	/**
	 * 跨服务 RPC 链路计时。
	 *
	 * @param hops    跳数，1~20，默认 5
	 * @param delayMs 每跳注入的模拟业务耗时（毫秒），0~500，默认 0
	 * @return {@code {"status":200,"data":<RpcChainReport>}}
	 */
	@GetMapping("/rpc-chain")
	public Mono<ApiEnvelope<RpcChainReport>> rpcChain(
			@RequestParam(name = "hops", defaultValue = "5") int hops,
			@RequestParam(name = "delayMs", defaultValue = "0") int delayMs) {
		return service.runChain(hops, delayMs)
				.map(ApiEnvelope::ok);
	}
}
