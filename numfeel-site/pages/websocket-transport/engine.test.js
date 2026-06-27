/**
 * TransportEngine 单元测试。
 * 运行：node numfeel-site/pages/websocket-transport/engine.test.js
 */
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  var diff = Math.abs(actual - expected);
  if (diff <= tol) {
    passed++;
    console.log('✅ ' + msg + ' (' + actual + ' ≈ ' + expected + ')');
  } else {
    failed++;
    console.error('❌ ' + msg + ' (actual=' + actual + ', expected=' + expected + ', diff=' + diff + ')');
  }
}

// ── 快照测试 ──

var highFreq = engine.snapshot({
  eventsPerMinute: 240, payloadSize: 320, activeSeconds: 180,
  clients: 800, pollInterval: 2, reconnects: 1
});
assert(highFreq.recommendation === 'websocket', '高频场景应推荐 websocket');
assert(highFreq.eventCount === 720, '高频场景 eventCount 应为 720');
assert(highFreq.pollCount === 90, '高频场景 pollCount 应为 90');
assert(highFreq.score >= 62, '高频场景评分应 >= 62');
assert(highFreq.websocket.latencyMs < highFreq.http.latencyMs, '高频场景 WS 延迟应小于 HTTP');

var sparse = engine.snapshot({
  eventsPerMinute: 1, payloadSize: 1600, activeSeconds: 120,
  clients: 1200, pollInterval: 30, reconnects: 0
});
assert(sparse.recommendation === 'http', '稀疏场景应推荐 http');
assert(sparse.eventCount === 2, '稀疏场景 eventCount 应为 2');
assert(sparse.pollCount === 4, '稀疏场景 pollCount 应为 4');
assert(sparse.score <= 42, '稀疏场景评分应 <= 42');
assert(sparse.websocket.memoryMb > sparse.http.memoryMb, '稀疏场景 WS 内存应大于 HTTP');

var mixed = engine.snapshot({
  eventsPerMinute: 30, payloadSize: 500, activeSeconds: 300,
  clients: 1500, pollInterval: 5, reconnects: 2
});
assert(mixed.recommendation === 'mixed', '中等场景应推荐 mixed');
assert(mixed.reason.indexOf('两边') >= 0, 'mixed 推荐理由应包含"两边"');

// ── 默认值测试 ──

var defaults = engine.snapshot(null);
assert(defaults.recommendation !== undefined, 'null 参数应使用默认值');
assert(defaults.eventCount > 0, 'null 参数 eventCount > 0');
assert(defaults.http.bytes > 0, 'null 参数 HTTP 流量 > 0');
assert(defaults.websocket.bytes > 0, 'null 参数 WS 流量 > 0');

var empty = engine.snapshot({});
assert(empty.recommendation !== undefined, '空对象应使用默认值');
assert(empty.eventCount === 180, '默认参数 eventCount 应为 180');
assert(empty.pollCount === 36, '默认参数 pollCount 应为 36');

// ── 边界值测试 ──

var huge = engine.snapshot({
  eventsPerMinute: 5000, payloadSize: 50000, activeSeconds: 7200,
  clients: 100000, pollInterval: 120, reconnects: 50
});
assert(huge.eventCount > 0 && huge.eventCount <= 60000, '超大值 eventCount 应被夹紧在合理范围');
assert(huge.recommendation !== undefined, '超大值应能正常计算');

var tiny = engine.snapshot({
  eventsPerMinute: 0, payloadSize: 1, activeSeconds: 1,
  clients: 0, pollInterval: 0.1, reconnects: -5
});
assert(tiny.recommendation !== undefined, '极小值应被夹紧');
assert(tiny.eventCount >= 1, 'eventCount 至少为 1');
assert(tiny.pollCount >= 1, 'pollCount 至少为 1');

// ── 工具函数测试 ──

assert(engine.formatBytes(0) === '0 B', 'formatBytes(0)');
assert(engine.formatBytes(500) === '500 B', 'formatBytes(500)');
assert(engine.formatBytes(2048) === '2.0 KB', 'formatBytes(2048)');
assert(engine.formatBytes(1048576) === '1.0 MB', 'formatBytes(1048576)');
assert(engine.formatBytes(1073741824) === '1.00 GB', 'formatBytes(1073741824)');

assert(engine.formatMs(50) === '50 ms', 'formatMs(50)');
assert(engine.formatMs(1200) === '1.2 s', 'formatMs(1200)');

// ── 吉祥物状态测试 ──

var wsState = engine.getMascotState('websocket');
assert(wsState.border === '#ce93d8', 'websocket 状态边框色');
assert(wsState.emoji === '⚡', 'websocket 状态 emoji');

var httpState = engine.getMascotState('http');
assert(httpState.border === '#81c784', 'http 状态边框色');
assert(httpState.emoji === '🐢', 'http 状态 emoji');

var mixedState = engine.getMascotState('mixed');
assert(mixedState.border === '#ffd700', 'mixed 状态边框色');

// ── 预设场景测试 ──

var presets = engine.getPresets();
assert(presets.length === 4, '应有 4 个预设场景');
presets.forEach(function(p) {
  var res = engine.snapshot(p.params);
  assert(res.recommendation !== undefined, '预设 ' + p.id + ' 应能正常计算');
});

// ── 随机提示测试 ──

var tip1 = engine.randomTip();
assert(typeof tip1 === 'string' && tip1.length > 0, 'randomTip 返回非空字符串');
var tip2 = engine.randomTip();
// 10 条提示池，两次可能相同，这里不强制要求不同

// ── summary 合理性 ──

var highSummary = highFreq.summary;
assert(highSummary.wsLatencySavedPercent > 0, '高频场景 WS 应节省延迟');
assert(highSummary.wsMemoryPenaltyPercent > 0, '高频场景 WS 内存应有惩罚');

var sparseSummary = sparse.summary;
assert(sparseSummary.wsMemoryPenaltyPercent > 0, '稀疏场景 WS 内存应有惩罚');

// ── 总结 ──

console.log('');
console.log('──────────────');
console.log('测试结果: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
