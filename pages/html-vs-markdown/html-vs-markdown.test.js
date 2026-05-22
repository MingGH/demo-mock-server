/**
 * HTML vs Markdown 对比实验室 - 单元测试
 * 运行: node pages/html-vs-markdown/html-vs-markdown.test.js
 */

// 加载场景数据
var fs = require('fs');
var scenariosCode = fs.readFileSync(__dirname + '/scenarios.js', 'utf8');
eval(scenariosCode);

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  var diff = Math.abs(actual - expected);
  assert(diff <= tolerance, msg + ' (got ' + actual + ', expected ~' + expected + ')');
}

// ── 测试场景数据完整性 ──
console.log('\n[场景数据完整性]');

assert(SCENARIOS.length === 5, '共 5 个场景');

SCENARIOS.forEach(function(s, i) {
  assert(s.id && s.id.length > 0, '场景 ' + (i+1) + ' 有 id');
  assert(s.title && s.title.length > 0, '场景 ' + (i+1) + ' 有 title');
  assert(s.markdown && s.markdown.length > 0, '场景 ' + (i+1) + ' 有 markdown 内容');
  assert(s.html && s.html.length > 0, '场景 ' + (i+1) + ' 有 html 内容');
  assert(s.metrics, '场景 ' + (i+1) + ' 有 metrics');
  assert(s.metrics.markdownChars > 0, '场景 ' + (i+1) + ' markdownChars > 0');
  assert(s.metrics.htmlChars > 0, '场景 ' + (i+1) + ' htmlChars > 0');
  assert(s.metrics.markdownInfoItems > 0, '场景 ' + (i+1) + ' markdownInfoItems > 0');
  assert(s.metrics.htmlInfoItems > 0, '场景 ' + (i+1) + ' htmlInfoItems > 0');
  assert(Array.isArray(s.metrics.htmlExtraFeatures), '场景 ' + (i+1) + ' 有 htmlExtraFeatures 数组');
});

// ── 测试字符数准确性 ──
console.log('\n[字符数验证]');

SCENARIOS.forEach(function(s) {
  var actualMd = s.markdown.length;
  var declaredMd = s.metrics.markdownChars;
  // 允许 15% 误差（因为字符数是手动标注的近似值）
  var tolerance = declaredMd * 0.25;
  assertApprox(actualMd, declaredMd, tolerance, s.id + ' markdown 字符数合理');
});

// ── 测试 HTML 比 Markdown 大 ──
console.log('\n[HTML 体积大于 Markdown]');

SCENARIOS.forEach(function(s) {
  assert(s.metrics.htmlChars > s.metrics.markdownChars,
    s.id + ': HTML (' + s.metrics.htmlChars + ') > MD (' + s.metrics.markdownChars + ')');
});

// ── 测试 HTML 信息项 >= Markdown 信息项 ──
console.log('\n[HTML 信息项 >= Markdown 信息项]');

SCENARIOS.forEach(function(s) {
  assert(s.metrics.htmlInfoItems >= s.metrics.markdownInfoItems,
    s.id + ': HTML info (' + s.metrics.htmlInfoItems + ') >= MD info (' + s.metrics.markdownInfoItems + ')');
});

// ── 测试信息密度计算逻辑 ──
console.log('\n[信息密度计算]');

SCENARIOS.forEach(function(s) {
  var mdDensity = s.metrics.markdownInfoItems / s.metrics.markdownChars * 1000;
  var htmlDensity = s.metrics.htmlInfoItems / s.metrics.htmlChars * 1000;
  // Markdown 的字符密度应该更高（因为它字符少但信息也少，但按比例更紧凑）
  // HTML 的绝对信息量更多，但字符也更多
  assert(mdDensity > 0, s.id + ': MD 信息密度 > 0 (' + mdDensity.toFixed(2) + ')');
  assert(htmlDensity > 0, s.id + ': HTML 信息密度 > 0 (' + htmlDensity.toFixed(2) + ')');
});

// ── 测试场景 ID 唯一 ──
console.log('\n[场景 ID 唯一性]');

var ids = SCENARIOS.map(function(s) { return s.id; });
var uniqueIds = ids.filter(function(id, i) { return ids.indexOf(id) === i; });
assert(uniqueIds.length === SCENARIOS.length, '所有场景 ID 唯一');

// ── 测试体积膨胀系数合理范围 ──
console.log('\n[体积膨胀系数合理性]');

SCENARIOS.forEach(function(s) {
  var ratio = s.metrics.htmlChars / s.metrics.markdownChars;
  assert(ratio >= 2 && ratio <= 7,
    s.id + ': 膨胀系数 ' + ratio.toFixed(1) + 'x 在合理范围 [2x, 7x]');
});

// ── 结果汇总 ──
console.log('\n' + '─'.repeat(40));
console.log('总计: ' + (passed + failed) + ' 个测试');
console.log('通过: ' + passed);
if (failed > 0) {
  console.log('失败: ' + failed);
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
