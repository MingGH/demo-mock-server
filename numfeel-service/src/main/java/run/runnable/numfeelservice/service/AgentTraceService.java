package run.runnable.numfeelservice.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import run.runnable.numfeelservice.controller.dto.AgentTraceResponses.AgentEvents;
import run.runnable.numfeelservice.controller.dto.AgentTraceResponses.AgentStats;
import run.runnable.numfeelservice.web.ApiException;

import java.time.Duration;

/**
 * trace-agent 数据转发服务。
 * <p>
 * trace-agent 以 {@code -javaagent} 挂载在本进程上，自带一个仅绑定 127.0.0.1 的
 * HTTP 接口；本服务是它对外的唯一窗口 —— 浏览器 → 本服务 → 回环地址 agent。
 * agent 未挂载（例如本地没带 -javaagent 启动）时返回 503，不影响其它功能。
 */
@Service
public class AgentTraceService {

	/** 本地回环地址上的 agent 内置接口基址。 */
	private final String agentBaseUrl;

	/** 用于调用回环接口的 WebClient（短超时；仅回环明文，无 TLS 信任配置）。 */
	private final WebClient webClient;

	public AgentTraceService(@Value("${numfeel.agent.port:9999}") int agentPort) {
		this.agentBaseUrl = "http://127.0.0.1:" + agentPort;
		HttpClient httpClient = HttpClient.create()
				.responseTimeout(Duration.ofSeconds(3));
		this.webClient = WebClient.builder()
				.clientConnector(new ReactorClientHttpConnector(httpClient))
				// 事件流单页最大 ~500 条（约 100KB），放宽到 1MB 防御性兜底
				.codecs(c -> c.defaultCodecs().maxInMemorySize(1024 * 1024))
				.build();
	}

	/**
	 * 增量拉取 agent 采集的方法调用事件。
	 *
	 * @param afterSeq 上次拉取到的游标，首次传 0
	 * @return 游标 + 统计 + 增量事件列表
	 */
	public Mono<AgentEvents> events(long afterSeq) {
		long safeAfterSeq = Math.max(0, afterSeq);
		return webClient.get()
				.uri(agentBaseUrl + "/agent/events?afterSeq=" + safeAfterSeq)
				.retrieve()
				.bodyToMono(AgentEvents.class)
				.onErrorMap(e -> agentUnavailable(e));
	}

	/**
	 * 拉取 agent 自身状态（插桩类数、累计采集/过滤/丢弃、游标）。
	 *
	 * @return agent 运行统计
	 */
	public Mono<AgentStats> stats() {
		return webClient.get()
				.uri(agentBaseUrl + "/agent/stats")
				.retrieve()
				.bodyToMono(AgentStats.class)
				.onErrorMap(e -> agentUnavailable(e));
	}

	private ApiException agentUnavailable(Throwable e) {
		return new ApiException(503,
				"trace-agent 未挂载或不可达（需以 -javaagent 启动）: " + e.getMessage());
	}
}
