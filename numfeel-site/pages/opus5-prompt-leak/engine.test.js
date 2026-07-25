/**
 * engine.js 单元测试
 * 运行: node pages/opus5-prompt-leak/engine.test.js
 */
var assert = function (cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
};
var assertClose = function (a, e, tol, msg) {
  if (Math.abs(a - e) <= tol) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg + ' (got ' + a + ', expect ' + e + ')'); failed++; }
};
var passed = 0, failed = 0;

var E = require('./engine.js');

// ── VERSIONS ──
assert(E.VERSIONS.length === 6, '版本数应为 6');
assert(E.VERSIONS[5].id === 'opus-5', '最后版本为 opus-5');
assert(E.VERSIONS[5].bytes === 202762, 'Opus 5 字节数 = 202762');
assert(E.VERSIONS[4].bytes === 149724, 'Opus 4.7 字节数 = 149724');

// ── formatBytes ──
assert(E.formatBytes(202762) === '198 KB', '202762 -> 198 KB');
assert(E.formatBytes(22967) === '22 KB', '22967 -> 22 KB');

// ── getVersionDeltas ──
var deltas = E.getVersionDeltas(E.VERSIONS);
assert(deltas.length === 5, '增量数组长度 = 5');
var lastDelta = deltas[deltas.length - 1];
assert(lastDelta.from === 'Claude Opus 4.7', '最后增量 from = 4.7');
assert(lastDelta.to === 'Claude Opus 5', '最后增量 to = 5');
assert(lastDelta.delta === 53038, '4.7->5 增量 = 53038');

// ── getSizeRatio ──
assertClose(E.getSizeRatio(), 8.8, 0.1, '最大/最小版本倍数 ≈ 8.8');

// ── getNewOrHighlightModules ──
var news = E.getNewOrHighlightModules();
assert(news.length > 0, '新增/亮点模块数 > 0');
var hasFable = news.some(function (m) { return m.name === 'fable_safeguards_routing'; });
assert(hasFable, '含 fable_safeguards_routing');
var hasMemory = news.some(function (m) { return m.name === 'memory_system'; });
assert(hasMemory, '含 memory_system');

// ── MODULE_DIFF 完整性 ──
var newCount = E.MODULE_DIFF.filter(function (m) { return m.isNew; }).length;
assert(newCount === 4, '4 个全新模块 (fable/boundaries/mcp/thinking)');

// ── HIGHLIGHTS ──
assert(E.HIGHLIGHTS.length === 8, '亮点数 = 8');
var h = E.getHighlightById('no-grovel');
assert(h !== null, '能按 id 查找亮点');
assert(h.title === '不许 Grovel', '亮点标题正确');
assert(E.getHighlightById('nonexistent') === null, '不存在 id 返回 null');

// 每个亮点都有 en/zh/roast/line
var allComplete = E.HIGHLIGHTS.every(function (h) {
  return h.en && h.zh && h.roast && h.line && h.file;
});
assert(allComplete, '所有亮点字段完整');

// ── MEMORY_TREE ──
assert(E.MEMORY_TREE.length === 5, '记忆目录树 = 5 个节点');
var hasProfile = E.MEMORY_TREE.some(function (n) { return n.path === '/profile.md'; });
assert(hasProfile, '含 /profile.md');

// ── PRIVACY_TIERS ──
assert(E.PRIVACY_TIERS.length === 3, '隐私分类 = 3 级');
assert(E.PRIVACY_TIERS[0].id === 'protected', '第一级 = protected');
assert(E.PRIVACY_TIERS[0].items.length > 5, 'protected 项数 > 5');

// ── get47to5Summary ──
var summary = E.get47to5Summary();
assert(summary.indexOf('800') > -1, '摘要提及 800 行');
assert(summary.indexOf('3') > -1, '摘要提及 3 行占位');

// ── getMemoryShareOfGrowth ──
var share = E.getMemoryShareOfGrowth();
assert(share.totalGrowth === 53038, '总增量 = 53038');
assert(share.memoryStub47 === 3, '4.7 stub = 3 行');
assert(share.memoryFull5 === 800, '5 记忆系统 = 800 行');

console.log('\n──────────────────');
console.log('通过 ' + passed + ' / 失败 ' + failed);
process.exit(failed > 0 ? 1 : 0);
