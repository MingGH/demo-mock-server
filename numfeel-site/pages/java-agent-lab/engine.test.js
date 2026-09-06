/**
 * java-agent-lab 引擎单元测试：node pages/java-agent-lab/engine.test.js 直接运行。
 */
const assert = (cond, msg) => {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
};
const assertClose = (actual, expected, tol, msg) =>
  assert(Math.abs(actual - expected) <= tol, msg + `（actual=${actual}, expected≈${expected}）`);

const { formatDuration, pickLaneColor, methodLabel, timelineLayout } = require('./engine.js');

let passed = 0, failed = 0;

// ── formatDuration ──
assert(formatDuration(820) === '820 µs', 'formatDuration: 微秒原样');
assert(formatDuration(3420) === '3.42 ms', 'formatDuration: 毫秒两位');
assert(formatDuration(34200) === '34.2 ms', 'formatDuration: 毫秒一位');
assert(formatDuration(1050000) === '1.05 s', 'formatDuration: 秒两位');
assert(formatDuration(-1) === '—', 'formatDuration: 非法输入兜底');

// ── pickLaneColor ──
assert(pickLaneColor('reactor-http-nio-3') === '#90caf9', 'pickLaneColor: nio → 蓝');
assert(pickLaneColor('boundedElastic-1') === '#ffb74d', 'pickLaneColor: boundedElastic → 橙');
assert(pickLaneColor('main') === '#ffd700', 'pickLaneColor: main → 金');
assert(pickLaneColor('trace-agent-http') === '#888888', 'pickLaneColor: 未知 → 灰');

// ── methodLabel ──
assert(methodLabel('JvmMemoryController', 'snapshot') === 'JvmMemoryController.snapshot()', 'methodLabel 拼接');

// ── timelineLayout ──
const T0 = 1788625278000;
const ev = (seq, epochMs, durUs, thread, error) =>
  ({ seq: seq, epochMs: epochMs, type: 'Foo', method: 'm' + seq, depth: 0,
     durationMicros: durUs, threadName: thread, error: !!error });

const empty = timelineLayout([], T0, 30000);
assert(empty.count === 0 && empty.lanes.length === 0, 'timelineLayout: 空输入安全');

const single = timelineLayout([ev(1, T0 + 1000, 500000, 'main')], T0 + 1000, 10000);
assert(single.count === 1 && single.lanes.length === 1, 'timelineLayout: 单事件单泳道');
assertClose(single.lanes[0].spans[0].width, 5, 0.5, 'timelineLayout: 500ms/10s 窗 → 宽约 5%');

// 同线程聚到一条泳道，不同线程各一条
const multi = timelineLayout([
  ev(1, T0 + 100, 10000, 'reactor-http-nio-1'),
  ev(2, T0 + 200, 10000, 'reactor-http-nio-1'),
  ev(3, T0 + 300, 20000, 'boundedElastic-2'),
], T0 + 1000, 30000);
assert(multi.lanes.length === 2, 'timelineLayout: 按线程分 2 条泳道');
assert(multi.lanes[0].spans.length === 2 && multi.lanes[1].spans.length === 1, 'timelineLayout: 泳道内事件数正确');

// 极短调用在窗口中部仍有最小可见宽度（参考时刻比事件晚 5s，事件位于窗口中央）
const tiny = timelineLayout([ev(1, T0 + 5000, 1, 'main')], T0 + 10000, 10000);
assert(tiny.lanes[0].spans[0].width >= 0.4, 'timelineLayout: 微事件保底宽度');

// 贴着窗口右缘结束时宽度被剩余空间截断，不越界
const edge = timelineLayout([ev(1, T0 + 5000, 1, 'main')], T0 + 5000, 1000);
assert(edge.count === 1, 'timelineLayout: 右缘事件保留');
assert(edge.lanes[0].spans[0].left + edge.lanes[0].spans[0].width <= 100.01, 'timelineLayout: 不越右边界');

// 窗口外事件被裁掉
const clipped = timelineLayout([ev(1, T0 - 5000, 1000, 'main')], T0 + 10000, 5000);
assert(clipped.count === 0, 'timelineLayout: 窗口外裁剪');

// error 事件原样透传
const err = timelineLayout([ev(1, T0, 1000, 'main', true)], T0, 1000);
assert(err.lanes[0].spans[0].event.error === true, 'timelineLayout: error 字段透传');

console.log(`\n结果：${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
