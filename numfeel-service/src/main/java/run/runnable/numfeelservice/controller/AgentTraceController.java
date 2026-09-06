package run.runnable.numfeelservice.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.AgentTraceResponses.AgentEvents;
import run.runnable.numfeelservice.controller.dto.AgentTraceResponses.AgentStats;
import run.runnable.numfeelservice.service.AgentTraceService;
import run.runnable.numfeelservice.web.ApiEnvelope;

/**
 * trace-agent 事件转发接口。
 * <p>
 * GET /agent/events —— 把本进程挂载的 trace-agent 采集到的方法调用事件流转发出去。
 * 这个 Controller 本身也被 agent 插桩了：调用它的这一次请求，会出现在它返回的
 * 事件流里（下一次拉取时可见），构成一个自证的演示。
 */
@RestController
@RequestMapping("/agent")
public class AgentTraceController {

	private final AgentTraceService service;

	public AgentTraceController(AgentTraceService service) {
		this.service = service;
	}

	/**
	 * 增量拉取 agent 采集的方法调用事件。
	 *
	 * @param afterSeq 上次拉取的游标，默认 0 表示从头
	 * @return {@code {"status":200,"data":<AgentEvents>}}；agent 未挂载时由全局异常处理器返回 503
	 */
	@GetMapping("/events")
	public Mono<ApiEnvelope<AgentEvents>> events(
			@RequestParam(name = "afterSeq", defaultValue = "0") long afterSeq) {
		return service.events(afterSeq)
				.map(ApiEnvelope::ok);
	}

	/**
	 * 返回 agent 运行统计（插桩类数、采集/过滤/丢弃计数）。
	 *
	 * @return {@code {"status":200,"data":<AgentStats>}}
	 */
	@GetMapping("/stats")
	public Mono<ApiEnvelope<AgentStats>> stats() {
		return service.stats()
				.map(ApiEnvelope::ok);
	}
}
