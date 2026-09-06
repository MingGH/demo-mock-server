package run.runnable.traceagent;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/**
 * 事件环形缓冲：固定容量，写满丢最旧，前端用 seq 做增量游标拉取。
 */
public final class EventStore {

	/** 缓冲上限：按单事件 ~100B 估算，峰值内存 < 1MB。 */
	static final int CAPACITY = 4096;

	/**
	 * 采集门槛（微秒）：低于它的方法调用不记录。
	 * 启动期某些工具方法（如分词 shouldCountWord）会被调数百万次、单次仅几微秒，
	 * 不设门槛会把环形缓冲和事件流全部淹没。
	 */
	static final int MIN_DURATION_MICROS = 10;

	private static final ArrayDeque<Event> BUFFER = new ArrayDeque<>(CAPACITY);
	private static final AtomicLong SEQ = new AtomicLong();
	private static final LongAdder COLLECTED = new LongAdder();
	private static final LongAdder DROPPED = new LongAdder();
	private static final LongAdder FILTERED = new LongAdder();

	private EventStore() {
	}

	/**
	 * 记录一条方法调用事件（由 {@link Bridge} 调用）。
	 * 耗时低于 {@link #MIN_DURATION_MICROS} 的事件直接过滤：这类事件通常是启动期
	 * 被调用数百万次的微小工具方法（如分词判断），只会淹没真正有信息量的调用。
	 *
	 * @param type           类简名
	 * @param method         方法名
	 * @param depth          嵌套深度
	 * @param durationMicros 耗时（微秒）
	 * @param threadName     线程名
	 * @param error          是否异常返回
	 */
	static void record(String type, String method, int depth,
	                   long durationMicros, String threadName, boolean error) {
		if (durationMicros < MIN_DURATION_MICROS) {
			FILTERED.increment();
			return;
		}
		long seq = SEQ.incrementAndGet();
		Event event = new Event(seq, System.currentTimeMillis(), type, method,
				depth, durationMicros, threadName, error);
		synchronized (BUFFER) {
			if (BUFFER.size() >= CAPACITY) {
				BUFFER.pollFirst();
				DROPPED.increment();
			}
			BUFFER.addLast(event);
		}
		COLLECTED.increment();
	}

	/**
	 * 拉取 seq 大于 afterSeq 的事件（增量读取）。
	 *
	 * @param afterSeq 游标，首次拉取传 0
	 * @return 按写入顺序排列的事件列表，最多 CAPACITY 条
	 */
	public static List<Event> after(long afterSeq) {
		synchronized (BUFFER) {
			List<Event> result = new ArrayList<>(BUFFER.size());
			for (Iterator<Event> it = BUFFER.iterator(); it.hasNext(); ) {
				Event e = it.next();
				if (e.seq() > afterSeq) {
					result.add(e);
				}
			}
			return result;
		}
	}

	/** 当前全局游标（最新事件 seq）。 */
	public static long cursor() {
		return SEQ.get();
	}

	/** 累计采集条数。 */
	public static long collected() {
		return COLLECTED.sum();
	}

	/** 因缓冲写满被丢弃的条数。 */
	public static long dropped() {
		return DROPPED.sum();
	}

	/** 因耗时低于 1µs 被过滤的条数。 */
	public static long filtered() {
		return FILTERED.sum();
	}
}
