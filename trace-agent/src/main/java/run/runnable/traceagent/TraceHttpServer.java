package run.runnable.traceagent;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Executors;

/**
 * agent 自带的内置 HTTP 接口。只绑定 127.0.0.1：进程外不可达，
 * 对外暴露由业务服务（numfeel-service 的转发 controller）决定。
 */
public final class TraceHttpServer {

	private TraceHttpServer() {
	}

	/**
	 * 启动内置接口（守护线程，随 JVM 退出）。
	 *
	 * @param port 监听端口（仅 127.0.0.1）
	 */
	static void start(int port) {
		try {
			HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 8);
			server.createContext("/agent/events", TraceHttpServer::handleEvents);
			server.createContext("/agent/stats", TraceHttpServer::handleStats);
			server.setExecutor(Executors.newSingleThreadExecutor(r -> {
				Thread t = new Thread(r, "trace-agent-http");
				t.setDaemon(true);
				return t;
			}));
			server.start();
		} catch (Throwable t) {
			java.util.logging.Logger.getLogger("trace-agent")
					.warning("内置 HTTP 启动失败（不影响业务）: " + t.getMessage());
		}
	}

	private static void handleEvents(HttpExchange exchange) throws IOException {
		if (preflight(exchange)) {
			return;
		}
		long afterSeq = 0;
		int limit = 500;
		String query = exchange.getRequestURI().getQuery();
		if (query != null) {
			for (String pair : query.split("&")) {
				String[] kv = pair.split("=", 2);
				if (kv.length != 2) {
					continue;
				}
				try {
					if ("afterSeq".equals(kv[0])) {
						afterSeq = Long.parseLong(kv[1]);
					} else if ("limit".equals(kv[0])) {
						limit = Math.min(4096, Math.max(1, Integer.parseInt(kv[1])));
					}
				} catch (NumberFormatException ignored) {
					// 非法参数按默认值处理
				}
			}
		}
		List<Event> all = EventStore.after(afterSeq);
		// 分页：只回最旧的 limit 条，游标指向本页最后一条，客户端带游标翻页
		List<Event> page = all.size() > limit ? all.subList(0, limit) : all;
		long pageCursor = page.isEmpty() ? EventStore.cursor() : page.get(page.size() - 1).seq();
		String body = Json.eventsResponse(pageCursor, EventStore.collected(), EventStore.filtered(),
				EventStore.dropped(), page);
		respond(exchange, body);
	}

	private static void handleStats(HttpExchange exchange) throws IOException {
		if (preflight(exchange)) {
			return;
		}
		String body = Json.statsResponse(Bridge.INSTRUMENTED_TYPES.sum(), EventStore.collected(),
				EventStore.filtered(), EventStore.dropped(), EventStore.cursor());
		respond(exchange, body);
	}

	/** CORS 预检与公共响应头：方便读者把 agent 挂到自己的项目后直接在本地页面里调。 */
	private static boolean preflight(HttpExchange exchange) throws IOException {
		exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
		exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
		if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
			exchange.sendResponseHeaders(204, -1);
			exchange.close();
			return true;
		}
		return false;
	}

	private static void respond(HttpExchange exchange, String body) throws IOException {
		byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		exchange.sendResponseHeaders(200, bytes.length);
		try (OutputStream os = exchange.getResponseBody()) {
			os.write(bytes);
		}
	}
}
