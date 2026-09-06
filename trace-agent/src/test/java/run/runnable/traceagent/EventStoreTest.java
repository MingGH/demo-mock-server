package run.runnable.traceagent;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

/**
 * EventStore 环形缓冲与 JSON 输出的基本验证。
 */
public class EventStoreTest {

	@Test
	public void 游标与增量拉取() {
		EventStore.record("A", "m", 0, 10, "t", false);
		EventStore.record("A", "m", 0, 11, "t", false);
		long cursor = EventStore.cursor();
		assertTrue(cursor >= 2);

		List<Event> none = EventStore.after(cursor);
		assertTrue(none.isEmpty());

		EventStore.record("B", "n", 1, 12, "t2", true);
		List<Event> delta = EventStore.after(cursor);
		assertEquals(1, delta.size());
		assertEquals("B", delta.get(0).type());
		assertTrue(delta.get(0).error());
	}

	@Test
	public void 低于门槛的调用被过滤() {
		long before = EventStore.filtered();
		EventStore.record("Noise", "tiny", 0, EventStore.MIN_DURATION_MICROS - 1, "t", false);
		assertEquals(before + 1, EventStore.filtered());
	}

	@Test
	public void 写满后丢最旧() {
		for (int i = 0; i < EventStore.CAPACITY + 10; i++) {
			EventStore.record("T", "m" + i, 0, EventStore.MIN_DURATION_MICROS + i, "thread", false);
		}
		List<Event> all = EventStore.after(0);
		assertEquals(EventStore.CAPACITY, all.size());
		// 最旧的 10 条应被挤出
		assertEquals("m10", all.get(0).method());
		assertTrue(EventStore.dropped() >= 10);
	}

	@Test
	public void json转义与结构() {
		String json = Json.eventsResponse(7, 100, 5, 0,
				List.of(new Event(7, 1725500000123L, "Foo\"Bar", "me\tth", 0, 42, "reactor-http-nio-3", false)));
		assertTrue(json.startsWith("{\"cursor\":7"));
		assertTrue(json.contains("\"filtered\":5"));
		assertTrue(json.contains("\"type\":\"Foo\\\"Bar\""));
		assertTrue(json.contains("\"method\":\"me\\tth\""));
		assertTrue(json.contains("\"durationMicros\":42"));
		assertTrue(json.endsWith("]}"));
	}
}
