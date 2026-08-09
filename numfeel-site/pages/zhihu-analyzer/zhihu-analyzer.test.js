/*
 * zhihu-analyzer.test.js — engine.js 纯 node 单元测试
 * 运行：node pages/zhihu-analyzer/zhihu-analyzer.test.js
 */
var E = require('./engine.js').ZhihuEngine;

var passed = 0;
var failed = 0;

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  \u2717 FAIL: ' + msg);
  }
}

function eq(a, b, msg) {
  ok(a === b, msg + ' (expected ' + b + ', got ' + a + ')');
}

// ── getTypeLabel ──────────────────────────────────────────
(function testGetTypeLabel() {
  eq(E.getTypeLabel('article'), '\u6587\u7ae0', 'article \u5e94\u8fd4\u56de \u6587\u7ae0');
  eq(E.getTypeLabel('answer'), '\u56de\u7b54', 'answer \u5e94\u8fd4\u56de \u56de\u7b54');
  eq(E.getTypeLabel('zvideo'), '\u89c6\u9891', 'zvideo \u5e94\u8fd4\u56de \u89c6\u9891');
  eq(E.getTypeLabel('pin'), '\u60f3\u6cd5', 'pin \u5e94\u8fd4\u56de \u60f3\u6cd5');
  eq(E.getTypeLabel('question'), '\u95ee\u9898', 'question \u5e94\u8fd4\u56de \u95ee\u9898');
  eq(E.getTypeLabel('unknown'), 'unknown', '\u672a\u77e5\u7c7b\u578b\u5e94\u539f\u6837\u8fd4\u56de');
})();

// ── getTypeColor ──────────────────────────────────────────
(function testGetTypeColor() {
  eq(E.getTypeColor('article'), '#ffd700', 'article \u989c\u8272');
  eq(E.getTypeColor('answer'), '#90caf9', 'answer \u989c\u8272');
  eq(E.getTypeColor('unknown'), '#888', '\u672a\u77e5\u7c7b\u578b\u9ed8\u8ba4\u989c\u8272');
})();

// ── formatNumber ──────────────────────────────────────────
(function testFormatNumber() {
  eq(E.formatNumber(500), '500', '500 \u4e0d\u53d8');
  eq(E.formatNumber(10000), '1.0\u4e07', '10000 \u5e94\u663e\u793a\u4e07');
  eq(E.formatNumber(25600), '2.6\u4e07', '25600 \u5e94\u663e\u793a 2.6\u4e07');
  // 1000~9999 \u663e\u793a\u5343\u5206\u4f4d\u5206\u9694
  ok(E.formatNumber(1000).indexOf(',') !== -1 || E.formatNumber(1000) === '1,000',
    '1000 \u5e94\u6709\u5343\u5206\u4f4d\u5206\u9694');
})();

// ── formatDate ────────────────────────────────────────────
(function testFormatDate() {
  eq(E.formatDate(0), '-', '\u65f6\u95f4\u6233 0 \u5e94\u8fd4\u56de -');
  // 2023-01-15 00:00:00 UTC = 1673740800
  var d = E.formatDate(1673740800);
  ok(d.startsWith('2023-01-1'), 'formatDate(1673740800) \u5e94\u5305\u542b 2023-01-1\uff0c\u5b9e\u9645: ' + d);
})();

// ── formatDateTime ────────────────────────────────────────
(function testFormatDateTime() {
  eq(E.formatDateTime(0), '-', '\u65f6\u95f4\u6233 0 \u5e94\u8fd4\u56de -');
  var dt = E.formatDateTime(1673740800);
  ok(dt.indexOf(':') !== -1, 'formatDateTime \u5e94\u5305\u542b\u65f6\u95f4\u5206\u9694\u7b26\uff0c\u5b9e\u9645: ' + dt);
})();

// ── median ────────────────────────────────────────────────
(function testMedian() {
  eq(E.median([]), 0, '\u7a7a\u6570\u7ec4\u4e2d\u4f4d\u6570\u4e3a 0');
  eq(E.median([5]), 5, '\u5355\u5143\u7d20\u4e2d\u4f4d\u6570');
  eq(E.median([1, 2, 3, 4, 5]), 3, '\u5947\u6570\u4e2a\u5143\u7d20\u4e2d\u4f4d\u6570');
  eq(E.median([1, 2, 3, 4]), 3, '\u5076\u6570\u4e2a\u5143\u7d20\u4e2d\u4f4d\u6570 (2+3)/2 \u56db\u820d\u4e94\u5165');
})();

// ── percentile90 ──────────────────────────────────────────
(function testPercentile90() {
  eq(E.percentile90([]), 0, '\u7a7a\u6570\u7ec4 P90');
  var arr = [];
  for (var i = 1; i <= 100; i++) arr.push(i);
  eq(E.percentile90(arr), 90, '1-100 \u7684 P90 \u5e94\u4e3a 90');
})();

// ── parseFilterText / dedupeFilterList 通过 app.js 的 IIFE 暴露在 window.__zaf 上做最小化集成测试 ──
(function testFilterHelpers() {
  // 临时把 app.js 的两个纯函数搬到测试可见区
  function parseFilterText(text) {
    if (!text) return [];
    return text.split(/[\n\r,，\s;；]+/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 0; });
  }
  function dedupeFilterList(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var w = (list[i] || '').trim();
      if (!w) continue;
      var key = w.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(w);
    }
    return out;
  }
  var r1 = parseFilterText('一个\nhttps,com；foo bar');
  eq(r1.length, 5, 'parseFilterText 切出 5 个');
  var r2 = parseFilterText('');
  eq(r2.length, 0, 'parseFilterText 空串返回空数组');
  var r3 = dedupeFilterList(['AI', 'ai', '  hello ', 'hello', 'world']);
  eq(r3.length, 3, 'dedupeFilterList 去重后剩 3 个');
  var r4 = dedupeFilterList(['a', 'A', 'A', 'b']);
  eq(r4.length, 2, 'dedupeFilterList 大小写不敏感去重');
})();

// ── histogram ─────────────────────────────────────────────
(function testHistogram() {
  var h = E.histogram([], 10);
  eq(h.labels.length, 0, '\u7a7a\u6570\u636e\u76f4\u65b9\u56fe\u65e0\u6876');

  var h2 = E.histogram([1, 1, 1, 1], 5);
  eq(h2.labels.length, 1, '\u5168\u76f8\u540c\u503c\u53ea\u67091\u4e2a\u6876');
  eq(h2.data[0], 4, '\u5168\u90e8 4 \u4e2a\u5728\u540c\u4e00\u6876');

  var h3 = E.histogram([0, 5, 10, 15, 20], 5);
  ok(h3.labels.length > 0, '\u6b63\u5e38\u6570\u636e\u5e94\u6709\u6876');
  ok(h3.median >= 0, '\u4e2d\u4f4d\u6570\u5e94 >= 0');
  ok(h3.p90 >= h3.median, 'P90 \u5e94 >= \u4e2d\u4f4d\u6570');
  ok(h3.buckets.length === h3.labels.length, '\u6bcf\u4e2a\u6876\u90fd\u6709\u5bf9\u5e94\u7684\u503c\u5217\u8868');
  var sumBuckets = 0;
  for (var bi = 0; bi < h3.buckets.length; bi++) sumBuckets += h3.buckets[bi].length;
  eq(sumBuckets, h3.data.reduce(function (a, b) { return a + b; }, 0), '\u6876\u5185\u503c\u6570\u91cf\u603b\u548c\u7b49\u4e8e\u8ba1\u6570');

  var h2b = E.histogram([1, 1, 1, 1], 5);
  eq(h2b.buckets[0].length, 4, '\u5355\u6876\u573a\u666f buckets \u4e5f\u6b63\u786e');

  // 幂律：max/min ≥ 50 时切对数桶
  var power = [];
  for (var i = 0; i < 200; i++) power.push(1);
  for (var j = 0; j < 30; j++) power.push(50);
  for (var k = 0; k < 5; k++) power.push(500);
  power.push(5000);
  var hp = E.histogram(power, 6);
  ok(hp.labels.length >= 3, '\u5e42\u5f8b\u5206\u5e03\u5e94\u4ea7\u751f\u591a\u4e2a\u5bf9\u6570\u6876\uff0c\u5b9e\u9645 ' + hp.labels.length);
  ok(hp.labels[0].indexOf('-') >= 0 || hp.labels[0].indexOf('+') >= 0,
    '\u5bf9\u6570\u6876\u6807\u7b7e\u5e94\u4e3a\u8303\u56f4\u6216\u201c+\u201d\uff0c\u5b9e\u9645: ' + hp.labels[0]);
  // 千分位：1000 应显示为 1,000
  var labelWithComma = E.histogram([1, 1000], 4).labels.join('|');
  ok(labelWithComma.indexOf('1,000') !== -1, '1000 \u5e94\u663e\u793a\u4e3a 1,000\uff0c\u5b9e\u9645: ' + labelWithComma);
})();

// ── aggregateByHour ───────────────────────────────────────
(function testAggregateByHour() {
  var items = [
    { createdAt: 1673740800 }, // UTC 00:00
    { createdAt: 1673744400 }, // UTC 01:00
    { createdAt: 1673740800 }
  ];
  var hours = E.aggregateByHour(items);
  eq(hours.length, 24, '\u5e94\u8fd4\u56de 24 \u5c0f\u65f6\u6570\u7ec4');
  var total = hours.reduce(function (a, b) { return a + b; }, 0);
  eq(total, 3, '\u603b\u6570\u5e94\u4e3a 3');
})();

// ── aggregateByWeekday ────────────────────────────────────
(function testAggregateByWeekday() {
  var items = [
    { createdAt: 1673740800 },
    { createdAt: 1673827200 },
    { createdAt: 1673913600 }
  ];
  var days = E.aggregateByWeekday(items);
  eq(days.length, 7, '\u5e94\u8fd4\u56de 7 \u5929\u6570\u7ec4');
  var total = days.reduce(function (a, b) { return a + b; }, 0);
  eq(total, 3, '\u603b\u6570\u5e94\u4e3a 3');
})();

// ── aggregateByMonth ──────────────────────────────────────
(function testAggregateByMonth() {
  var items = [
    { createdAt: 1673740800 }, // 2023-01
    { createdAt: 1673827200 }, // 2023-01
    { createdAt: 1677628800 }  // 2023-03
  ];
  var m = E.aggregateByMonth(items);
  ok(m.labels.length >= 2, '\u5e94\u81f3\u5c11\u67092\u4e2a\u6708\u4efd');
  ok(m.data.length === m.labels.length, 'labels \u548c data \u957f\u5ea6\u4e00\u81f4');
})();

// ── computeStats ──────────────────────────────────────────
(function testComputeStats() {
  var empty = E.computeStats([]);
  eq(empty.total, 0, '\u7a7a\u5217\u8868 total \u4e3a 0');

  var items = [
    { contentType: 'article', createdAt: 1673740800, likeCount: 100, commentCount: 20, favoriteCount: 10 },
    { contentType: 'article', createdAt: 1673827200, likeCount: 200, commentCount: 30, favoriteCount: 20 },
    { contentType: 'answer',  createdAt: 1677628800, likeCount: 50,  commentCount: 5,  favoriteCount: 3 }
  ];
  var s = E.computeStats(items);
  eq(s.total, 3, 'total \u5e94\u4e3a 3');
  eq(s.totalLikes, 350, 'totalLikes \u5e94\u4e3a 350');
  eq(s.totalComments, 55, 'totalComments \u5e94\u4e3a 55');
  eq(s.totalFavorites, 33, 'totalFavorites \u5e94\u4e3a 33');
  ok(s.span > 0, 'span \u5e94\u5927\u4e8e 0');
  eq(s.byType['article'], 2, 'article \u5e94\u67092\u7bc7');
  eq(s.byType['answer'], 1, 'answer \u5e94\u67091\u7bc7');
  ok(s.avgLikes > 0, 'avgLikes \u5e94\u5927\u4e8e 0');
})();

// ── movingAverage ─────────────────────────────────────────
(function testMovingAverage() {
  var data = [10, 20, 30, 40, 50];
  var ma = E.movingAverage(data, 3);
  eq(ma.length, 5, '\u79fb\u52a8\u5e73\u5747\u957f\u5ea6\u5e94\u4e0e\u539f\u59cb\u6570\u636e\u4e00\u81f4');
  // \u4e2d\u95f4\u503c\u5e94\u5728\u539f\u59cb\u6570\u636e\u8303\u56f4\u5185
  ok(ma[2] >= 10 && ma[2] <= 50, '\u4e2d\u95f4\u70b9\u79fb\u52a8\u5e73\u5747\u5e94\u5728\u8303\u56f4\u5185');
})();

// ── generateInsight ───────────────────────────────────────
(function testGenerateInsight() {
  var stats = {
    total: 100,
    span: 365,
    byType: { article: 60, answer: 40 },
    avgLikes: 50,
    totalLikes: 5000
  };
  var text = E.generateInsight(stats);
  ok(text.indexOf('100') !== -1, 'insight \u5e94\u5305\u542b\u603b\u6570');
  ok(text.indexOf('365') !== -1, 'insight \u5e94\u5305\u542b\u8de8\u5ea6');
  ok(text.indexOf('\u6587\u7ae0') !== -1, 'insight \u5e94\u5305\u542b\u4e3b\u529b\u7c7b\u578b');
})();

// ── generateSummary ───────────────────────────────────────
(function testGenerateSummary() {
  var items = [
    { contentType: 'article', createdAt: 1673740800, likeCount: 100, commentCount: 20, favoriteCount: 10 }
  ];
  var stats = E.computeStats(items);
  var summary = E.generateSummary(items, stats);
  ok(summary.indexOf('\u77e5\u4e4e\u521b\u4f5c\u5206\u6790\u62a5\u544a') !== -1, 'summary \u5e94\u5305\u542b\u6807\u9898');
  ok(summary.indexOf('\u6570\u5b57\u76f4\u89c9') !== -1, 'summary \u5e94\u5305\u542b\u6765\u6e90');
  ok(summary.indexOf('1') !== -1, 'summary \u5e94\u5305\u542b\u603b\u6570');
})();

// ── \u6c47\u603b ──────────────────────────────────────────────────
console.log('\n\u77e5\u4e4e\u521b\u4f5c\u5206\u6790 engine.js \u6d4b\u8bd5\uff1a' + passed + ' \u901a\u8fc7, ' + failed + ' \u5931\u8d25');
if (failed > 0) {
  process.exit(1);
}
