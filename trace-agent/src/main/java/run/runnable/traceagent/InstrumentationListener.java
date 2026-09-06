package run.runnable.traceagent;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.description.type.TypeDescription;
import net.bytebuddy.dynamic.DynamicType;
import net.bytebuddy.utility.JavaModule;

/**
 * 插桩监听：统计成功改写的类型数，暴露在 /agent/stats 里，
 * 让前端能显示「agent 已插桩 N 个类」这个证据。
 */
final class InstrumentationListener implements AgentBuilder.Listener {

	@Override
	public void onDiscovery(String typeName, ClassLoader classLoader, JavaModule module, boolean loaded) {
	}

	@Override
	public void onTransformation(TypeDescription typeDescription, ClassLoader classLoader,
	                             JavaModule module, boolean loaded, DynamicType dynamicType) {
		Bridge.INSTRUMENTED_TYPES.increment();
	}

	@Override
	public void onIgnored(TypeDescription typeDescription, ClassLoader classLoader,
	                      JavaModule module, boolean loaded) {
	}

	@Override
	public void onError(String typeName, ClassLoader classLoader, JavaModule module,
	                    boolean loaded, Throwable throwable) {
		java.util.logging.Logger.getLogger("trace-agent")
				.warning("插桩失败 " + typeName + ": " + throwable);
	}

	@Override
	public void onComplete(String typeName, ClassLoader classLoader, JavaModule module, boolean loaded) {
	}
}
