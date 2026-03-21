/**
 * 帕隆多悖论 — 单元测试
 * node pages/parrondo-paradox.test.js
 */

const {
  getParams, playGameA, playGameB, getGameForStep,
  simulateOnce, simulateMonteCarlo,
  gameB_stationaryBadCoinProb, compareStrategies
} = require('./parrondo-paradox-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  ✅ ${msg} (${actual} ≈ ${expected})`);
  } else {
    failed++;
    console.log(`  ❌ ${msg} (${actual} ≠ ${expected}, tolerance=${tolerance})`);
  }
}

// ========== 参数测试 ==========
console.log('\n📐 参数计算');
{
  const p = getParams();
  assert(p.pA === 0.495, 'pA = 0.5 - 0.005 = 0.495');
  assert(p.pB_good === 0.745, 'pB_good = 0.75 - 0.005 = 0.745');
  assert(p.pB_bad === 0.095, 'pB_bad = 0.1 - 0.005 = 0.095');
  assert(p.M === 3, 'M = 3');
}

{
  const p = getParams({ epsilon: 0.01 });
  assert(p.pA === 0.49, 'custom epsilon: pA = 0.49');
  assert(p.pB_good === 0.74, 'custom epsilon: pB_good = 0.74');
}

// ========== 策略模式测试 ==========
console.log('\n🎮 策略模式');
{
  assert(getGameForStep(0, 'A') === 'A', 'pure A always returns A');
  assert(getGameForStep(5, 'B') === 'B', 'pure B always returns B');
  assert(getGameForStep(0, 'AB') === 'A', 'AB step 0 = A');
  assert(getGameForStep(1, 'AB') === 'B', 'AB step 1 = B');
  assert(getGameForStep(2, 'AB') === 'A', 'AB step 2 = A');
  assert(getGameForStep(0, 'AABB') === 'A', 'AABB step 0 = A');
  assert(getGameForStep(1, 'AABB') === 'A', 'AABB step 1 = A');
  assert(getGameForStep(2, 'AABB') === 'B', 'AABB step 2 = B');
  assert(getGameForStep(3, 'AABB') === 'B', 'AABB step 3 = B');
  assert(getGameForStep(0, 'ABB') === 'A', 'ABB step 0 = A');
  assert(getGameForStep(1, 'ABB') === 'B', 'ABB step 1 = B');
  assert(getGameForStep(2, 'ABB') === 'B', 'ABB step 2 = B');
}

// ========== 单次模拟测试 ==========
console.log('\n🎲 单次模拟');
{
  const result = simulateOnce(100, 'A');
  assert(result.history.length === 101, '100步模拟产生101个数据点');
  assert(result.history[0] === 0, '初始资金为0');
  assert(typeof result.finalCapital === 'number', 'finalCapital 是数字');

  // 每步变化应为 +1 或 -1
  let validSteps = true;
  for (let i = 1; i < result.history.length; i++) {
    const diff = Math.abs(result.history[i] - result.history[i - 1]);
    if (diff !== 1) { validSteps = false; break; }
  }
  assert(validSteps, '每步变化为 ±1');
}

// ========== 蒙特卡洛模拟测试 ==========
console.log('\n📊 蒙特卡洛模拟');
{
  const trials = 5000;
  const steps = 500;

  // Game A 应该是输的
  const resultA = simulateMonteCarlo(trials, steps, 'A');
  assert(resultA.meanFinal < 0, `Game A 平均亏损 (mean=${resultA.meanFinal})`);
  assert(resultA.avgHistory.length === steps + 1, 'avgHistory 长度正确');

  // Game B 应该也是输的
  const resultB = simulateMonteCarlo(trials, steps, 'B');
  assert(resultB.meanFinal < 0, `Game B 平均亏损 (mean=${resultB.meanFinal})`);

  // AABB 组合应该是赢的
  const resultAABB = simulateMonteCarlo(trials, steps, 'AABB');
  assert(resultAABB.meanFinal > 0, `AABB 组合平均盈利 (mean=${resultAABB.meanFinal})`);

  // ABB 组合应该也是赢的
  const resultABB = simulateMonteCarlo(trials, steps, 'ABB');
  assert(resultABB.meanFinal > 0, `ABB 组合平均盈利 (mean=${resultABB.meanFinal})`);

  // winRate 在合理范围
  assert(resultA.winRate < 50, `Game A 胜率 < 50% (${resultA.winRate}%)`);
  assert(resultAABB.winRate > 50, `AABB 胜率 > 50% (${resultAABB.winRate}%)`);
}

// ========== 马尔可夫链稳态分析 ==========
console.log('\n🔬 马尔可夫链稳态分析');
{
  const stat = gameB_stationaryBadCoinProb();
  assert(stat !== null, '返回非空结果');
  // 文献值: π0 ≈ 0.3836
  assertApprox(stat.pi0, 0.3836, 0.01, 'π0 ≈ 0.3836');
  // Game B 期望收益应为负
  assert(stat.expectedPerStep < 0, `Game B 期望收益为负 (${stat.expectedPerStep})`);
}

// ========== 多策略对比 ==========
console.log('\n⚔️ 多策略对比');
{
  const results = compareStrategies(1000, 300, ['A', 'B', 'AABB', 'ABB']);
  assert('A' in results, '包含 Game A 结果');
  assert('B' in results, '包含 Game B 结果');
  assert('AABB' in results, '包含 AABB 结果');
  assert('ABB' in results, '包含 ABB 结果');
  assert(results['A'].meanFinal < results['AABB'].meanFinal, 'AABB 优于 A');
  assert(results['B'].meanFinal < results['AABB'].meanFinal, 'AABB 优于 B');
}

// ========== 总结 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
if (failed > 0) process.exit(1);
