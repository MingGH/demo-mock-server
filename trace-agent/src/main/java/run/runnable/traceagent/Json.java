package run.runnable.traceagent;

import java.util.List;

/**
 * 手写 JSON 序列化：agent 零第三方依赖（ByteBuddy 除外），事件体积小、格式固定，
 * 手写比引入 Jackson 更符合「单 jar 裸奔」的约束。
 */
public final class Json {

	private Json() {
	}

	/**
	 * JSON 字符串转义（引号、反斜杠、控制字符）。
	 *
	 * @param s 原始字符串
	 * @return 可安全拼进 JSON 的字符串
	 */
	public static String esc(String s) {
		if (s == null) {
			return "";
		}
		StringBuilder sb = new StringBuilder(s.length() + 8);
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			switch (c) {
				case '"' -> sb.append("\\\"");
				case '\\' -> sb.append("\\\\");
				case '\n' -> sb.append("\\n");
				case '\r' -> sb.append("\\r");
				case '\t' -> sb.append("\\t");
				default -> {
					if (c < 0x20) {
						sb.append(String.format("\\u%04x", (int) c));
					} else {
						sb.append(c);
					}
				}
			}
		}
		return sb.toString();
	}

	/**
	 * 构造 /agent/events 响应体。
	 * <p>
	 * 注意返回的是<b>裸数据</b>：status/data 信封由对外暴露的业务服务
	 * （numfeel-service）统一包裹，agent 自身不越俎代庖。
	 *
	 * @param cursor    本次响应覆盖到的游标（分页后最后一条事件的 seq）
	 * @param collected 累计采集数
	 * @param filtered  被亚微秒过滤的条数
	 * @param dropped   丢弃数
	 * @param events    事件列表
	 * @return JSON 文本
	 */
	public static String eventsResponse(long cursor, long collected, long filtered,
	                                    long dropped, List<Event> events) {
		StringBuilder sb = new StringBuilder(256 + events.size() * 160);
		sb.append("{\"cursor\":").append(cursor)
				.append(",\"collected\":").append(collected)
				.append(",\"filtered\":").append(filtered)
				.append(",\"dropped\":").append(dropped)
				.append(",\"events\":[");
		for (int i = 0; i < events.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			writeEvent(sb, events.get(i));
		}
		return sb.append("]}").toString();
	}

	/**
	 * 构造 /agent/stats 响应体（裸数据，理由同上）。
	 *
	 * @param instrumentedTypes 已插桩类型数
	 * @param collected         累计采集数
	 * @param filtered          被过滤条数
	 * @param dropped           丢弃数
	 * @param cursor            最新游标
	 * @return JSON 文本
	 */
	public static String statsResponse(long instrumentedTypes, long collected,
	                                   long filtered, long dropped, long cursor) {
		return "{\"instrumentedTypes\":" + instrumentedTypes
				+ ",\"collected\":" + collected
				+ ",\"filtered\":" + filtered
				+ ",\"dropped\":" + dropped
				+ ",\"cursor\":" + cursor + "}";
	}

	private static void writeEvent(StringBuilder sb, Event e) {
		sb.append("{\"seq\":").append(e.seq())
				.append(",\"epochMs\":").append(e.epochMs())
				.append(",\"type\":\"").append(esc(e.type())).append('"')
				.append(",\"method\":\"").append(esc(e.method())).append('"')
				.append(",\"depth\":").append(e.depth())
				.append(",\"durationMicros\":").append(e.durationMicros())
				.append(",\"threadName\":\"").append(esc(e.threadName())).append('"')
				.append(",\"error\":").append(e.error())
				.append('}');
	}
}
