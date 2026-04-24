// 通勤人生计算器 核心算法测试
// 运行: node pages/commute-cost/commute-cost.test.js

var engine = require('./engine.js');
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
  assert(diff <= tolerance, msg + ' (actual=' + actual + ', expected=' + expected + ')');
}

// ── calcCommuteTime ──
console.log('\n[calcCommuteTime]');
(function() {
  // 单程 30 分钟，每周 5 天，每年 48 周，工作 35 年
  var r = engine.calcCommuteTime(30, 5, 48, 35);
  assert(r.dailyHours === 1, '每天往返 1 小时');
  assert(r.yearlyHours === 240, '每年 240 小时 (1h × 5天 × 48周)');
  assert(r.lifetimeHours === 8400, '一辈子 8400 小时 (240 × 35)');
  assertApprox(r.lifetimeDays, 350, 0.1, '折合 350 天');
  assertApprox(r.lifetimeYears, 0.96, 0.01, '折合约 0.96 年');

  // 单程 60 分钟
  var r2 = engine.calcCommuteTime(60, 5, 48, 35);
  assert(r2.dailyHours === 2, '每天往返 2 小时');
  assert(r2.lifetimeHours === 16800, '一辈子 16800 小时');
  assertApprox(r2.lifetimeYears, 1.92, 0.01, '折合约 1.92 年');

  // 单程 47 分钟（北京）
  var r3 = engine.calcCommuteTime(47, 5, 48, 35);
  assertApprox(r3.dailyHours, 1.57, 0.01, '北京每天往返约 1.57 小时');
  assertApprox(r3.lifetimeHours, 13160, 10, '北京一辈子约 13160 小时');
})();

// ── timeEquivalents ──
console.log('\n[timeEquivalents]');
(function() {
  var eq = engine.timeEquivalents(1000);
  assert(eq.movies === 500, '1000h = 500 部电影');
  assert(eq.books === 166, '1000h = 166 本书');
  assert(eq.marathons === 222, '1000h = 222 次全马');
  assertApprox(eq.languages, 1.67, 0.01, '1000h = 1.67 门外语');
  assert(eq.sleepDays === 125, '1000h = 125 天好觉');

  var eq2 = engine.timeEquivalents(8400);
  assert(eq2.movies === 4200, '8400h = 4200 部电影');
  assert(eq2.books === 1400, '8400h = 1400 本书');
})();

// ── calcTimeSaved ──
console.log('\n[calcTimeSaved]');
(function() {
  // 从 40 分钟减少 15 分钟 → 25 分钟
  var s = engine.calcTimeSaved(40, 15, 5, 48, 35);
  var original = engine.calcCommuteTime(40, 5, 48, 35);
  var reduced = engine.calcCommuteTime(25, 5, 48, 35);
  var expectedSaved = engine.round2(original.lifetimeHours - reduced.lifetimeHours);
  assertApprox(s.savedLifetimeHours, expectedSaved, 0.1, '节省的小时数正确');
  assert(s.savedLifetimeHours > 0, '节省时间为正数');
  assert(s.equivalents.movies > 0, '节省时间能看电影');
  assert(s.equivalents.books > 0, '节省时间能读书');
})();

// ── calcMoneyCost ──
console.log('\n[calcMoneyCost]');
(function() {
  var cost = engine.calcMoneyCost(8400, 50);
  assert(cost === 420000, '8400h × 50元/h = 42万');

  var cost2 = engine.calcMoneyCost(16800, 100);
  assert(cost2 === 1680000, '16800h × 100元/h = 168万');
})();

// ── generateComparisonData ──
console.log('\n[generateComparisonData]');
(function() {
  var data = engine.generateComparisonData(5, 48, 35);
  assert(data.length > 0, '返回了数据');
  assert(data[0].minutes === 10, '从 10 分钟开始');
  assert(data[data.length - 1].minutes === 90, '到 90 分钟结束');

  // 时间应该递增
  var increasing = true;
  for (var i = 1; i < data.length; i++) {
    if (data[i].lifetimeYears <= data[i - 1].lifetimeYears) {
      increasing = false;
      break;
    }
  }
  assert(increasing, '通勤时间越长，一辈子消耗越多');
})();

// ── CITY_DATA ──
console.log('\n[CITY_DATA]');
(function() {
  assert(engine.CITY_DATA.length >= 8, '至少 8 个城市');
  var beijing = engine.CITY_DATA.find(function(c) { return c.city === '北京'; });
  assert(beijing && beijing.oneWay === 47, '北京单程 47 分钟');
  var tokyo = engine.CITY_DATA.find(function(c) { return c.city === '东京'; });
  assert(tokyo && tokyo.oneWay === 50, '东京单程 50 分钟');
})();

// ── 边界情况 ──
console.log('\n[边界情况]');
(function() {
  var r = engine.calcCommuteTime(5, 5, 48, 35);
  assert(r.lifetimeHours > 0, '最短通勤也有时间消耗');

  var r2 = engine.calcCommuteTime(120, 6, 50, 40);
  assert(r2.lifetimeYears > 3, '极端通勤超过 3 年');
})();

// ── 总结 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) {
  console.log('❌ 有测试失败');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
}
