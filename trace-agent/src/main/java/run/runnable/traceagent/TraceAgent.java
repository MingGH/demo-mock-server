package run.runnable.traceagent;

import java.lang.instrument.Instrumentation;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.description.type.TypeDescription;
import net.bytebuddy.matcher.ElementMatcher;
import net.bytebuddy.matcher.ElementMatchers;

/**
 * Java Agent 入口。
 * <p>
 * 用法一（随启动挂载）：{@code java -javaagent:trace-agent.jar -jar app.jar}
 * <br>用法二（运行中热挂载）：{@code VirtualMachine.attach(pid).loadAgent("trace-agent.jar")}
 * <p>
 * 参数（逗号分隔；packages 内部的多个包用分号分隔）：
 * <ul>
 *   <li>{@code port=9999} —— 内置 HTTP 接口端口（默认 9999，仅绑定 127.0.0.1）</li>
 *   <li>{@code packages=a.b.c;d.e.f} —— 要插桩的包前缀（默认 numfeel-service 的 controller/service）</li>
 * </ul>
 */
public final class TraceAgent {

	/** 默认插桩包：numfeel-service 的 Controller / Service 层。 */
	static final String DEFAULT_PACKAGES =
			"run.runnable.numfeelservice.controller;run.runnable.numfeelservice.service";

	/** 内置 HTTP 默认端口。 */
	static final int DEFAULT_PORT = 9999;

	private TraceAgent() {
	}

	/**
	 * JVM 启动入口：在业务 main() 之前执行。
	 *
	 * @param args -javaagent 冒号后的参数串，可为 null
	 * @param inst JVM 提供的 Instrumentation 手术台
	 */
	public static void premain(String args, Instrumentation inst) {
		install(parse(args), inst, false);
	}

	/**
	 * 运行中 attach 入口：对已启动的 JVM 热挂载，已加载的类会被 retransform。
	 *
	 * @param args 参数串，可为 null
	 * @param inst JVM 提供的 Instrumentation 手术台
	 */
	public static void agentmain(String args, Instrumentation inst) {
		install(parse(args), inst, true);
	}

	private static void install(AgentOptions opts, Instrumentation inst, boolean retransform) {
		ElementMatcher.Junction<TypeDescription> types = ElementMatchers.none();
		for (String pkg : opts.packages) {
			types = types.or(ElementMatchers.nameStartsWith(pkg));
		}
		// 永远排除 agent 自己（含 shade 命名空间），否则采集逻辑会递归插桩自己
		types = types.and(ElementMatchers.not(ElementMatchers.nameStartsWith("run.runnable.traceagent")));
		// 排除 DTO 与合成类（record 访问器、lambda 隐藏类），只留业务方法
		types = types.and(ElementMatchers.not(ElementMatchers.nameContains(".dto.")));
		types = types.and(ElementMatchers.not(ElementMatchers.nameContains("$$")));

		AgentBuilder builder = new AgentBuilder.Default()
				.disableClassFormatChanges()
				.with(new InstrumentationListener())
				.type(types)
				.transform((b, type, cl, module, pd) -> b.visit(
						net.bytebuddy.asm.Advice.to(TimingAdvice.class)
								.on(ElementMatchers.isMethod()
										.and(ElementMatchers.not(ElementMatchers.isBridge()))
										.and(ElementMatchers.not(ElementMatchers.isSynthetic())))));
		if (retransform) {
			builder = builder.with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION);
		}
		builder.installOn(inst);

		TraceHttpServer.start(opts.port);
		log("agent 已挂载：packages=[" + String.join(", ", opts.packages)
				+ "]，内置接口 http://127.0.0.1:" + opts.port + "/agent/events");
	}

	/** 极简参数解析，解析失败用默认值，绝不抛异常阻断业务进程。 */
	private static AgentOptions parse(String args) {
		AgentOptions opts = new AgentOptions();
		opts.port = DEFAULT_PORT;
		opts.packages = DEFAULT_PACKAGES.split(";");
		if (args == null || args.isBlank()) {
			return opts;
		}
		for (String pair : args.split(",")) {
			String[] kv = pair.split("=", 2);
			if (kv.length != 2) {
				continue;
			}
			switch (kv[0].trim()) {
				case "port" -> opts.port = Integer.parseInt(kv[1].trim());
				case "packages" -> opts.packages = kv[1].trim().split(";");
				default -> { }
			}
		}
		return opts;
	}

	/** 解析后的 agent 参数。 */
	private static final class AgentOptions {
		private int port;
		private String[] packages;
	}

	private static void log(String msg) {
		java.util.logging.Logger.getLogger("trace-agent").info(msg);
	}
}
