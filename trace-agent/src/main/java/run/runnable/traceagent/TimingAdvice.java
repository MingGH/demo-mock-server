package run.runnable.traceagent;

import net.bytebuddy.asm.Advice;

/**
 * 计时插桩模板。被 ByteBuddy 以「内联」方式拷贝进目标方法体：
 * 方法首尾各插入一次调用，不生成代理类、不改变方法签名。
 * <p>
 * {@code @Advice.Origin("#t")} / {@code "#m"} 在编译改写期替换为字符串常量，
 * 运行时零反射开销。
 */
public class TimingAdvice {

	/**
	 * 方法进入：记录起始时间戳。
	 *
	 * @return 纳秒级起始时间，经 {@code @Advice.Enter} 传给 exit
	 */
	@Advice.OnMethodEnter
	static long enter() {
		return Bridge.enter();
	}

	/**
	 * 方法退出（含异常路径）：计算耗时并写入事件环形缓冲。
	 *
	 * @param startNanos enter 返回的起始时间
	 * @param type       目标类的全限定名（改写期常量）
	 * @param method     目标方法名（改写期常量）
	 * @param thrown     方法体抛出的异常，正常返回时为 null
	 */
	@Advice.OnMethodExit(onThrowable = Throwable.class)
	static void exit(@Advice.Enter long startNanos,
	                 @Advice.Origin("#t") String type,
	                 @Advice.Origin("#m") String method,
	                 @Advice.Thrown Throwable thrown) {
		Bridge.exit(startNanos, type, method, thrown != null);
	}
}
