package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/**
 * trace-agent 采集事件流的数据传输对象集合。
 * <p>
 * 字段与 trace-agent 内置 HTTP 接口 {@code GET /agent/events} 的 JSON 结构一一对应，
 * 由 Jackson 按组件名反序列化。
 */
public final class AgentTraceResponses {

	private AgentTraceResponses() {
	}

	/**
	 * 一次被插桩方法调用的事件记录。
	 *
	 * @param seq            全局递增序号，作为增量拉取游标
	 * @param epochMs        事件完成时刻（墙钟毫秒）
	 * @param type           被插桩类简名，如 {@code JvmMemoryController}
	 * @param method         被插桩方法名
	 * @param depth          同线程嵌套深度（0 为最外层）
	 * @param durationMicros 方法体耗时（微秒）
	 * @param threadName     执行线程名（反应式服务里即「工作现场」）
	 * @param error          方法体是否抛出异常
	 */
	public record AgentEvent(
			/** 全局递增序号，作为增量拉取游标。 */
			long seq,
			/** 事件完成时刻（墙钟毫秒）。 */
			long epochMs,
			/** 被插桩类简名。 */
			String type,
			/** 被插桩方法名。 */
			String method,
			/** 同线程嵌套深度，0 为最外层。 */
			int depth,
			/** 方法体耗时（微秒）。 */
			long durationMicros,
			/** 执行线程名。 */
			String threadName,
			/** 方法体是否抛出异常。 */
			boolean error) {
	}

	/**
	 * /agent/events 接口的聚合响应。
	 *
	 * @param cursor    本次响应覆盖到的游标，前端下次用它继续增量拉取
	 * @param collected agent 累计采集的事件总数
	 * @param filtered  被耗时门槛过滤掉的调用次数（耗时低于 10µs 不记录）
	 * @param dropped   因环形缓冲写满被丢弃的事件数
	 * @param events    本次增量事件列表（seq 升序）
	 */
	public record AgentEvents(
			/** 本次响应覆盖到的游标。 */
			long cursor,
			/** 累计采集事件总数。 */
			long collected,
			/** 被耗时门槛过滤掉的调用次数（耗时低于 10µs 不记录）。 */
			long filtered,
			/** 因缓冲写满被丢弃的事件数。 */
			long dropped,
			/** 本次增量事件列表。 */
			List<AgentEvent> events) {
	}

	/**
	 * /agent/stats 接口的聚合响应。
	 *
	 * @param instrumentedTypes agent 已插桩的业务类数量
	 * @param collected         累计采集事件总数
	 * @param filtered          被耗时门槛过滤掉的调用次数（耗时低于 10µs 不记录）
	 * @param dropped           因环形缓冲写满被丢弃的事件数
	 * @param cursor            agent 当前最新游标
	 */
	public record AgentStats(
			/** agent 已插桩的业务类数量。 */
			long instrumentedTypes,
			/** 累计采集事件总数。 */
			long collected,
			/** 被耗时门槛过滤掉的调用次数（耗时低于 10µs 不记录）。 */
			long filtered,
			/** 因缓冲写满被丢弃的事件数。 */
			long dropped,
			/** agent 当前最新游标。 */
			long cursor) {
	}
}
