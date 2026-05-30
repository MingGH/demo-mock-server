// 37%法则 / 最优停止 核心算法测试
// 运行: node pages/optimal-stopping/optimal-stopping.test.js

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
  assert(diff <= tolerance, msg + ' (actual=' + actual.toFixed(4) + ', expected=' + expected.toFixed(4) + ', tol=' + tolerance + ')');
}

// ── generateCandidates ──
console.log('\n[generateCandidates]');
(function() {
  var c = engine.generateCandidates(10);
  assert(c.length === 10, '生成 10 个候选人');
  assert(new Set(c).size === 10, '无重复');
  assert(c.every(function(v) { return v >= 1 && v <= 100; }), '值在 1~100 范围内');

  var c2 = engine.generateCandidates(50);
  assert(c2.length === 50, '生成 50 个候选人');
  assert(new Set(c2).size === 50, '50 个无重复');
})();

// ── theoreticalOptimalR ──
console.log('\n[theoreticalOptimalR]');
(function() {
  assert(engine.theoreticalOptimalR(10) === 4, 'N=10 → r=4 (10/e≈3.68, 四舍五入)');
  assert(engine.theoreticalOptimalR(20) === 7, 'N=20 → r=7');
  assert(engine.theoreticalOptimalR(100) === 37, 'N=100 → r=37');
  assert(engine.theoreticalOptimalR(3) === 1, 'N=3 → r=1 (最小为1)');
})();

// ── optimalStoppingStrategy ──
console.log('\n[optimalStoppingStrategy]');
(function() {
  // 固定序列测试
  var candidates = [30, 50, 20, 80, 10, 90, 40, 60];
  // N=8, r=3 (8/e≈2.94, 四舍五入=3)
  // 前3个: [30, 50, 20], 最大=50
  // 第4个: 80 > 50 → 选80
  var result = engine.optimalStoppingStrategy(candidates, 3);
  assert(result.chosen === 80, '选到80（第一个超过观察期最大值50的）');
  assert(result.index === 3, '在第4个位置选的');
  assert(result.isBest === false, '80不是最佳（90才是）');

  // 最佳在观察期内
  var candidates2 = [90, 50, 80, 30, 20, 10, 40, 60];
  var result2 = engine.optimalStoppingStrategy(candidates2, 3);
  // 前3个: [90, 50, 80], 最大=90
  // 后面没有超过90的 → 选最后一个60
  assert(result2.chosen === 60, '没有超过观察期最大值，选最后一个');
  assert(result2.index === 7, '被迫选最后一个');

  // 最佳恰好在观察期后第一个
  var candidates3 = [30, 20, 10, 90, 50, 40, 80, 60];
  var result3 = engine.optimalStoppingStrategy(candidates3, 3);
  assert(result3.chosen === 90, '选到最佳90');
  assert(result3.isBest === true, '确实是最佳');
})();

// ── randomStrategy ──
console.log('\n[randomStrategy]');
(function() {
  var candidates = [10, 20, 30, 40, 50];
  var result = engine.randomStrategy(candidates);
  assert(candidates.indexOf(result.chosen) !== -1, '选的是候选人之一');
  assert(typeof result.isBest === 'boolean', '返回 isBest 布尔值');
})();

// ── firstStrategy / lastStrategy ──
console.log('\n[firstStrategy / lastStrategy]');
(function() {
  var candidates = [30, 50, 20, 80, 10];
  var first = engine.firstStrategy(candidates);
  assert(first.chosen === 30, '选第一个=30');
  assert(first.index === 0, 'index=0');

  var last = engine.lastStrategy(candidates);
  assert(last.chosen === 10, '选最后一个=10');
  assert(last.index === 4, 'index=4');
})();

// ── theoreticalSuccessRate ──
console.log('\n[theoreticalSuccessRate]');
(function() {
  // N很大时，最优r的成功率趋近 1/e ≈ 0.3679
  var rate100 = engine.theoreticalSuccessRate(100, 37);
  assertApprox(rate100, 1 / Math.E, 0.01, 'N=100, r=37 → ≈1/e');

  var rate1000 = engine.theoreticalSuccessRate(1000, 368);
  assertApprox(rate1000, 1 / Math.E, 0.005, 'N=1000, r=368 → ≈1/e');

  // r=0 时成功率 = 1/n
  var rate0 = engine.theoreticalSuccessRate(10, 0);
  assertApprox(rate0, 0.1, 0.001, 'r=0 → 1/N = 0.1');
})();

// ── runSimulation 统计验证 ──
console.log('\n[runSimulation - 统计验证]');
(function() {
  var result = engine.runSimulation(20, 10000);

  // 37%法则应该在 30%~45% 之间
  assert(result.optimal > 0.28 && result.optimal < 0.48,
    '37%法则成功率在合理范围 (' + (result.optimal * 100).toFixed(1) + '%)');

  // 随机选应该接近 1/20 = 5%
  assert(result.random > 0.02 && result.random < 0.10,
    '随机选成功率接近 5% (' + (result.random * 100).toFixed(1) + '%)');

  // 选第一个 = 1/20 = 5%
  assert(result.first > 0.02 && result.first < 0.10,
    '选第一个成功率接近 5% (' + (result.first * 100).toFixed(1) + '%)');

  // 37%法则应该显著优于随机
  assert(result.optimal > result.random * 2,
    '37%法则成功率 > 随机的2倍');

  assert(result.optimalR === 7, 'N=20 的最优跳过数 = 7');
})();

// ── scanSkipRatios ──
console.log('\n[scanSkipRatios]');
(function() {
  var result = engine.scanSkipRatios(20, 2000);

  assert(result.ratios.length > 0, '返回了比例数组');
  assert(result.rates.length === result.ratios.length, '比例和成功率数组等长');

  // 最佳比例应该在 25%~50% 之间
  assert(result.bestRatio >= 20 && result.bestRatio <= 55,
    '最佳跳过比例在合理范围 (' + result.bestRatio + '%)');

  // 最佳成功率应该在 30%~45%
  assert(result.bestRate > 0.25 && result.bestRate < 0.50,
    '最佳成功率在合理范围 (' + (result.bestRate * 100).toFixed(1) + '%)');
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
