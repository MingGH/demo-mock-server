package run.runnable.traceagent;

import java.util.concurrent.atomic.LongAdder;

/**
 * 插桩代码的运行时桥：被内联进业务类的方法体，因此这个类必须
 * 对业务类加载器可见 —— 它住在 agent jar（系统 classpath）里，
 * Spring Boot 的 LaunchedURLClassLoader 向父委派即可找到。
 */
public final class Bridge {

	/** 每线程嵌套深度：同线程内 controller → service 调用可形成层级。 */
	private static final ThreadLocal<int[]> DEPTH = ThreadLocal.withInitial(() -> new int[1]);

	/** 已成功插桩并完成改写的类型数。 */
	static final LongAdder INSTRUMENTED_TYPES = new LongAdder();

	private Bridge() {
	}

	/**
	 * 目标方法进入。
	 *
	 * @return 纳秒时间戳
	 */
	public static long enter() {
		DEPTH.get()[0]++;
		return System.nanoTime();
	}

	/**
	 * 目标方法退出：计算耗时并落进事件缓冲。
	 * 任何异常都被吞掉 —— agent 绝不能把异常泄漏给业务进程。
	 *
	 * @param startNanos enter 记录的起始时间
	 * @param type       类全限定名
	 * @param method     方法名
	 * @param error      方法体是否抛了异常
	 */
	public static void exit(long startNanos, String type, String method, boolean error) {
		int depth = --DEPTH.get()[0];
		try {
			long durationMicros = (System.nanoTime() - startNanos) / 1000L;
			EventStore.record(shortName(type), method, depth, durationMicros,
					Thread.currentThread().getName(), error);
		} catch (Throwable ignore) {
			// 静默：观测设施自身故障不允许影响业务
		}
	}

	private static String shortName(String type) {
		int i = type.lastIndexOf('.');
		return i < 0 ? type : type.substring(i + 1);
	}
}
