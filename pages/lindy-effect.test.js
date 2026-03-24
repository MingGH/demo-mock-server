/**
 * 林迪效应核心算法单元测试
 * 运行方式: node pages/lindy-effect.test.js
 */

const {
  lindyExpectedRemaining,
  lindyMedianRemaining,
  survivalProbability,
  survivalCurve,
  monteCarloLindy,
  compareItems,
  alphaSensitivity,
  PRESETS
} = require('./lindy-effect-logic.js');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.error('  ✗', name);
    console.error('   ', e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `Expected ${a} ≈ ${b} (tol=${tol})`);
}

// ========== lindyExpectedRemaining ==========
console.log('\n=== lindyExpectedRemaining ===');
test('alpha=2, age=20 => 期望剩余 20 年', () => {
  assertClose(lindyExpectedRemaining(20, 2), 20, 0.001);
});
test('alpha=1.5, age=100 => 期望剩余 200 年', () => {
  assertClose(lindyExpectedRemaining(100, 1.5), 200, 0.001);
});
test('alpha=3, age=30 => 期望剩余 15 年', () => {
  assertClose(lindyExpectedRemaining(30, 3), 15, 0.001);
});
test('age=0 返回 0', () => {
  assertClose(lindyExpectedRemaining(0, 2), 0, 0.001);
});
test('alpha<=1 返回 Infinity', () => {
  assert(lindyExpectedRemaining(10, 1) === Infinity);
  assert(lindyExpectedRemaining(10, 0.5) === Infinity);
});

// ========== lindyMedianRemaining ==========
console.log('\n=== lindyMedianRemaining ===');
test('alpha=2, age=20 => 中位剩余 ≈ 8.28 年', () => {
  var expected = 20 * (Math.pow(2, 0.5) - 1);
  assertClose(lindyMedianRemaining(20, 2), expected, 0.01);
});
test('age=0 返回 0', () => {
  assertClose(lindyMedianRemaining(0, 2), 0, 0.001);
});
test('中位数 < 期望值（右偏分布）', () => {
  var med = lindyMedianRemaining(50, 2);
  var exp = lindyExpectedRemaining(50, 2);
  assert(med < exp, `中位数 ${med} 应小于期望 ${exp}`);
});

// ========== survivalProbability ==========
console.log('\n=== survivalProbability ===');
test('extra=0 时概率为 1', () => {
  assertClose(survivalProbability(10, 0, 2), 1, 0.001);
});
test('alpha=2, age=10, extra=10 => (10/20)^2 = 0.25', () => {
  assertClose(survivalProbability(10, 10, 2), 0.25, 0.001);
});
test('概率随 extra 增大而递减', () => {
  var p1 = survivalProbability(10, 5, 2);
  var p2 = survivalProbability(10, 10, 2);
  var p3 = survivalProbability(10, 20, 2);
  assert(p1 > p2 && p2 > p3, '概率应递减');
});
test('age 越大，同样 extra 的生存概率越高', () => {
  var pYoung = survivalProbability(5, 10, 2);
  var pOld = survivalProbability(50, 10, 2);
  assert(pOld > pYoung, `老事物 ${pOld} 应 > 新事物 ${pYoung}`);
});

// ========== survivalCurve ==========
console.log('\n=== survivalCurve ===');
test('返回正确数量的数据点', () => {
  var curve = survivalCurve(10, 2, 50, 50);
  assert(curve.length === 51, `Expected 51 points, got ${curve.length}`);
});
test('第一个点概率为 1', () => {
  var curve = survivalCurve(10, 2, 50, 50);
  assertClose(curve[0].probability, 1, 0.001);
});
test('概率单调递减', () => {
  var curve = survivalCurve(10, 2, 50, 20);
  for (var i = 1; i < curve.length; i++) {
    assert(curve[i].probability <= curve[i-1].probability, '概率应单调递减');
  }
});

// ========== monteCarloLindy ==========
console.log('\n=== monteCarloLindy ===');
test('蒙特卡洛均值接近理论期望 (alpha=2)', () => {
  var age = 20;
  var alpha = 2;
  var result = monteCarloLindy(age, alpha, 20000);
  var theory = lindyExpectedRemaining(age, alpha);
  // 帕累托分布方差大，放宽容差
  assertClose(result.mean, theory, theory * 0.15, 
    `MC mean ${result.mean} vs theory ${theory}`);
});
test('蒙特卡洛中位数接近理论中位数', () => {
  var age = 50;
  var alpha = 2;
  var result = monteCarloLindy(age, alpha, 20000);
  var theory = lindyMedianRemaining(age, alpha);
  assertClose(result.median, theory, theory * 0.1,
    `MC median ${result.median} vs theory ${theory}`);
});
test('p25 < median < p75 < p90', () => {
  var result = monteCarloLindy(30, 2, 5000);
  assert(result.p25 < result.median, 'p25 < median');
  assert(result.median < result.p75, 'median < p75');
  assert(result.p75 < result.p90, 'p75 < p90');
});
test('直方图 counts 总和接近 trials', () => {
  var result = monteCarloLindy(10, 2, 5000);
  var total = result.histogram.counts.reduce(function(s, v) { return s + v; }, 0);
  // 截断到95%，所以约有5%不在直方图内
  assert(total > 4000, `Histogram total ${total} too low`);
});

// ========== compareItems ==========
console.log('\n=== compareItems ===');
test('老事物预期剩余寿命更长', () => {
  var items = [{ name: '新', age: 2 }, { name: '老', age: 100 }];
  var results = compareItems(items, 2);
  assert(results[1].expectedRemaining > results[0].expectedRemaining,
    '老事物应有更长的预期剩余寿命');
});
test('totalExpected = age + expectedRemaining', () => {
  var items = [{ name: 'test', age: 30 }];
  var results = compareItems(items, 2);
  assertClose(results[0].totalExpected, 30 + 30, 0.001);
});

// ========== alphaSensitivity ==========
console.log('\n=== alphaSensitivity ===');
test('alpha 越大，预期剩余寿命越短', () => {
  var results = alphaSensitivity(50, [1.5, 2, 3, 5]);
  for (var i = 1; i < results.length; i++) {
    assert(results[i].expected < results[i-1].expected,
      `alpha=${results[i].alpha} 应比 alpha=${results[i-1].alpha} 预期更短`);
  }
});

// ========== PRESETS ==========
console.log('\n=== PRESETS ===');
test('预设数据包含 4 个分类', () => {
  assert(Object.keys(PRESETS).length === 4);
});
test('每个分类有 4 个条目', () => {
  Object.keys(PRESETS).forEach(function(key) {
    assert(PRESETS[key].length === 4, `${key} should have 4 items`);
  });
});

// ========== 林迪效应核心性质验证 ==========
console.log('\n=== 林迪效应核心性质 ===');
test('已存在时间翻倍 => 预期剩余寿命翻倍（线性关系）', () => {
  var e1 = lindyExpectedRemaining(10, 2);
  var e2 = lindyExpectedRemaining(20, 2);
  assertClose(e2 / e1, 2, 0.001);
});
test('存在 100 年的书 vs 存在 1 年的书，预期寿命差 100 倍', () => {
  var old = lindyExpectedRemaining(100, 2);
  var young = lindyExpectedRemaining(1, 2);
  assertClose(old / young, 100, 0.001);
});

console.log('\n' + '='.repeat(40));
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
