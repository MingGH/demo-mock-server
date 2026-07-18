/**
 * Canvas vs HTML/CSS 能力对决 - 单元测试
 * 运行命令: node pages/canvas-vs-html/canvas-vs-html.test.js
 */

var L = require('./canvas-vs-html-logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  \u2705 ' + msg);
    passed++;
  } else {
    console.log('  \u274C ' + msg);
    failed++;
  }
}

function assertApprox(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + ' (\u5b9e\u9645=' + actual + ', \u671f\u671b=' + expected + ')');
}

// ========== 1. \u7279\u6027\u6570\u636e\u5b8c\u6574\u6027 ==========
console.log('\n\ud83d\udcca 1. \u7279\u6027\u6570\u636e\u5b8c\u6574\u6027');

assert(L.FEATURES.length === 12, '\u5171 12 \u4e2a\u7279\u6027\u5bf9\u6bd4\u9879');
assert(L.FEATURES.every(function (f) {
  return f.id && f.name && f.category && f.htmlSupport && f.canvasSupport && f.verdict;
}), '\u6bcf\u4e2a\u7279\u6027\u90fd\u6709\u5b8c\u6574\u5b57\u6bb5');

var validSupports = ['native', 'partial', 'manual', 'none'];
assert(L.FEATURES.every(function (f) {
  return validSupports.indexOf(f.htmlSupport) >= 0 && validSupports.indexOf(f.canvasSupport) >= 0;
}), '\u652f\u6301\u7ea7\u522b\u503c\u5408\u6cd5');

// ========== 2. \u5206\u7c7b\u6570\u636e ==========
console.log('\n\ud83c\udfe0 2. \u5206\u7c7b\u6570\u636e');

var catIds = L.getCategoryIds();
assert(catIds.length === 4, '\u5171 4 \u4e2a\u5206\u7c7b');
assert(catIds.indexOf('accessibility') >= 0, '\u5305\u542b accessibility \u5206\u7c7b');
assert(catIds.indexOf('layout') >= 0, '\u5305\u542b layout \u5206\u7c7b');
assert(catIds.indexOf('interaction') >= 0, '\u5305\u542b interaction \u5206\u7c7b');
assert(catIds.indexOf('ecosystem') >= 0, '\u5305\u542b ecosystem \u5206\u7c7b');

catIds.forEach(function (id) {
  var cat = L.CATEGORIES[id];
  assert(cat.name && cat.icon && cat.color, '\u5206\u7c7b ' + id + ' \u6709\u540d\u79f0\u3001\u56fe\u6807\u3001\u989c\u8272');
});

// ========== 3. \u6309\u5206\u7c7b\u7b5b\u9009 ==========
console.log('\n\ud83d\udd0d 3. \u6309\u5206\u7c7b\u7b5b\u9009');

var accFeatures = L.getFeaturesByCategory('accessibility');
assert(accFeatures.length === 3, 'accessibility \u5206\u7c7b\u6709 3 \u4e2a\u7279\u6027');
assert(accFeatures.every(function (f) { return f.category === 'accessibility'; }), '\u7b5b\u9009\u7ed3\u679c\u5206\u7c7b\u6b63\u786e');

var layoutFeatures = L.getFeaturesByCategory('layout');
assert(layoutFeatures.length === 3, 'layout \u5206\u7c7b\u6709 3 \u4e2a\u7279\u6027');

var interFeatures = L.getFeaturesByCategory('interaction');
assert(interFeatures.length === 3, 'interaction \u5206\u7c7b\u6709 3 \u4e2a\u7279\u6027');

var ecoFeatures = L.getFeaturesByCategory('ecosystem');
assert(ecoFeatures.length === 3, 'ecosystem \u5206\u7c7b\u6709 3 \u4e2a\u7279\u6027');

// ========== 4. \u7279\u6027\u8bc4\u5206\u8ba1\u7b97 ==========
console.log('\n\ud83c\udfc6 4. \u7279\u6027\u8bc4\u5206\u8ba1\u7b97');

var scores = L.computeFeatureScores();
assert(scores.htmlScore > scores.canvasScore, 'HTML \u603b\u5206\u9ad8\u4e8e Canvas');
assert(scores.htmlScore >= 80, 'HTML \u5f97\u5206\u5e94 >= 80% (\u5b9e\u9645: ' + scores.htmlScore + '%)');
assert(scores.canvasScore <= 40, 'Canvas \u5f97\u5206\u5e94 <= 40% (\u5b9e\u9645: ' + scores.canvasScore + '%)');
assert(scores.maxTotal === 36, '\u6ee1\u5206\u4e3a 12*3=36');

// \u5206\u7c7b\u8bc4\u5206
assert(scores.categories.accessibility, '\u6709 accessibility \u5206\u7c7b\u8bc4\u5206');
assert(scores.categories.accessibility.htmlPct === 100, 'HTML \u65e0\u969c\u788d\u5f97\u5206 100%');
assert(scores.categories.accessibility.canvasPct <= 33, 'Canvas \u65e0\u969c\u788d\u5f97\u5206\u5f88\u4f4e');

// ========== 5. \u4ee3\u7801\u590d\u6742\u5ea6 ==========
console.log('\n\ud83d\udcdd 5. \u4ee3\u7801\u590d\u6742\u5ea6');

var complexity = L.getCodeComplexity();
assert(complexity.ratio > 5, '\u4ee3\u7801\u91cf\u6bd4\u7387 > 5\u500d (\u5b9e\u9645: ' + complexity.ratio + '\u500d)');
assert(complexity.htmlLines === 12, 'HTML \u5b9e\u73b0 12 \u884c');
assert(complexity.canvasLines === 85, 'Canvas \u5b9e\u73b0 85 \u884c');
assert(complexity.task.length > 10, '\u4efb\u52a1\u63cf\u8ff0\u975e\u7a7a');

// ========== 6. \u6027\u80fd\u6a21\u62df ==========
console.log('\n\u26a1 6. \u6027\u80fd\u6a21\u62df');

var perf10 = L.simulatePerformance(10);
assert(perf10.dom > 50, '10\u4e2a\u5143\u7d20 DOM fps > 50 (\u5b9e\u9645: ' + perf10.dom + ')');
assert(!perf10.crossover, '10\u4e2a\u5143\u7d20 DOM \u4f18\u4e8e Canvas');

var perf50000 = L.simulatePerformance(50000);
assert(perf50000.crossover, '50000\u4e2a\u5143\u7d20 Canvas \u4f18\u4e8e DOM');
assert(perf50000.dom < 10, '50000\u4e2a\u5143\u7d20 DOM fps \u5f88\u4f4e (\u5b9e\u9645: ' + perf50000.dom + ')');

// \u6027\u80fd\u7cfb\u5217
var series = L.generatePerformanceSeries(L.DEFAULT_COUNTS);
assert(series.length === 10, '\u9ed8\u8ba4 10 \u4e2a\u6570\u636e\u70b9');
assert(series[0].elementCount === 10, '\u7b2c\u4e00\u4e2a\u70b9\u662f 10 \u4e2a\u5143\u7d20');
assert(series[series.length - 1].elementCount === 50000, '\u6700\u540e\u4e00\u4e2a\u70b9\u662f 50000');

// fps \u5e94\u8be5\u662f\u5408\u7406\u8303\u56f4
assert(series.every(function (p) {
  return p.dom >= 5 && p.dom <= 60 && p.canvas >= 10 && p.canvas <= 60;
}), '\u6240\u6709 fps \u5728\u5408\u7406\u8303\u56f4 [5-60]');

// ========== 7. \u4ea4\u53c9\u70b9\u67e5\u627e ==========
console.log('\n\ud83d\udea6 7. \u4ea4\u53c9\u70b9\u67e5\u627e');

var crossover = L.findCrossoverPoint();
assert(crossover > 100, '\u4ea4\u53c9\u70b9 > 100 \u4e2a\u5143\u7d20 (\u5b9e\u9645: ' + crossover + ')');
assert(crossover < 10000, '\u4ea4\u53c9\u70b9 < 10000 \u4e2a\u5143\u7d20');

// \u4ea4\u53c9\u70b9\u5de6\u53f3\u7684\u6027\u80fd\u5e94\u8be5\u7b26\u5408\u9884\u671f
var belowCross = L.simulatePerformance(crossover - 10);
var aboveCross = L.simulatePerformance(crossover + 10);
assert(!belowCross.crossover || aboveCross.crossover, '\u4ea4\u53c9\u70b9\u9644\u8fd1\u6027\u80fd\u5173\u7cfb\u53d8\u5316');

// ========== 8. Canvas \u4f18\u52bf\u573a\u666f ==========
console.log('\n\ud83c\udfae 8. Canvas \u4f18\u52bf\u573a\u666f');

assert(L.CANVAS_STRENGTHS.length === 5, '\u5171 5 \u4e2a Canvas \u4f18\u52bf\u573a\u666f');
assert(L.CANVAS_STRENGTHS.every(function (s) {
  return s.id && s.name && s.reason && s.typical;
}), '\u6bcf\u4e2a\u573a\u666f\u90fd\u6709\u5b8c\u6574\u5b57\u6bb5');

// ========== 9. \u7efc\u5408\u8bc4\u4f30 ==========
console.log('\n\ud83d\udcdd 9. \u7efc\u5408\u8bc4\u4f30');

var verdict = L.generateVerdict();
assert(verdict.summary.length > 50, '\u6458\u8981\u4e0d\u4e3a\u7a7a');
assert(verdict.recommendation.length > 10, '\u5efa\u8bae\u4e0d\u4e3a\u7a7a');
assert(verdict.scores.htmlScore > 0, '\u5305\u542b\u8bc4\u5206');
assert(verdict.crossover > 0, '\u5305\u542b\u4ea4\u53c9\u70b9');
assert(verdict.complexity.ratio > 0, '\u5305\u542b\u590d\u6742\u5ea6');

// ========== 10. \u4ee3\u7801\u5bf9\u6bd4\u6570\u636e ==========
console.log('\n\ud83d\udcbb 10. \u4ee3\u7801\u5bf9\u6bd4\u6570\u636e');

assert(L.CODE_COMPARISON.task.length > 0, '\u4efb\u52a1\u63cf\u8ff0\u5b58\u5728');
assert(L.CODE_COMPARISON.html.code.indexOf('button') >= 0, 'HTML \u4ee3\u7801\u5305\u542b button');
assert(L.CODE_COMPARISON.canvas.code.indexOf('Canvas') >= 0, 'Canvas \u4ee3\u7801\u5305\u542b Canvas');
assert(L.CODE_COMPARISON.html.lines < L.CODE_COMPARISON.canvas.lines, 'HTML \u4ee3\u7801\u884c\u6570\u5c11\u4e8e Canvas');

// \u2500\u2500 \u6c47\u603b \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('\u901a\u8fc7: ' + passed + ' / \u5931\u8d25: ' + failed);
console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
if (failed > 0) {
  console.error('\u274C \u5b58\u5728\u5931\u8d25\u7528\u4f8b');
  process.exit(1);
} else {
  console.log('\u2705 \u5168\u90e8\u901a\u8fc7');
}
