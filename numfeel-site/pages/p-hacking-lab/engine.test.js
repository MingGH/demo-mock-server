/**
 * p-hacking 实验室引擎测试。
 * 运行：node engine.test.js
 */

const {
  mulberry32,
  normalCdf,
  twoProportionPValue,
  binomial,
  simulateTest,
  simulatePeeking,
  runExperiment,
  expectedAtLeastOne,
  bonferroniAlpha,
  pStars,
  formatP
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + message);
  } else {
    failed++;
    console.error('  ❌ ' + message);
  }
}

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, message + '（实际 ' + actual + '）');
}

console.log('\n📍 随机数与正态分布');
{
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert(a() === b(), '相同种子生成相同随机数');
  assert(a() >= 0 && a() < 1, '随机数落在 [0, 1)');
  assertClose(normalCdf(0), 0.5, 1e-6, 'normalCdf(0) = 0.5');
  assertClose(normalCdf(1.96), 0.975, 1e-3, 'normalCdf(1.96) ≈ 0.975');
  assertClose(normalCdf(-1.96), 0.025, 1e-3, 'normalCdf(-1.96) ≈ 0.025');
}

console.log('\n📍 双样本比例检验');
{
  assert(twoProportionPValue(100, 1000, 100, 1000) === 1, '两组比例相同 p = 1');
  const p = twoProportionPValue(150, 1000, 100, 1000);
  assert(p > 0 && p < 0.01, '明显差异得到小 p 值');
  assert(twoProportionPValue(0, 1000, 0, 1000) === 1, '全是 0 转化时 p = 1');
  assert(twoProportionPValue(1000, 1000, 1000, 1000) === 1, '全是 100% 转化时 p = 1');
  assert(twoProportionPValue(10, 0, 20, 100) === 1, '零样本量返回 p = 1');
  const symmetricA = twoProportionPValue(120, 1000, 80, 1000);
  const symmetricB = twoProportionPValue(80, 1000, 120, 1000);
  assertClose(symmetricA, symmetricB, 1e-12, '交换两组后 p 值对称');
}

console.log('\n📍 二项采样与单次测试');
{
  const rng = mulberry32(7);
  const count = binomial(1000, 1, rng);
  assert(count === 1000, 'p = 1 时全部转化');
  assert(binomial(1000, 0, rng) === 0, 'p = 0 时没有转化');
  const result = simulateTest({ n: 2000, p: 0.1, rng: mulberry32(3) });
  assert(result.nA === 2000 && result.nB === 2000, '两组样本量正确');
  assert(result.p >= 0 && result.p <= 1, 'p 值落在 [0, 1]');
}

console.log('\n📍 边测边看');
{
  const result = simulatePeeking({ maxN: 2000, chunks: 10, p: 0.1, alpha: 0.05, rng: mulberry32(5) });
  assert(result.usedN <= 2000, '最多使用 maxN 个样本');
  assert(result.p >= 0 && result.p <= 1, 'peeking p 值合法');
  assert(typeof result.stopped === 'boolean', 'stopped 是布尔值');
}

console.log('\n📍 整组实验');
{
  const first = runExperiment({ tests: 20, n: 1000, p: 0.1, alpha: 0.05, seed: 9 });
  const second = runExperiment({ tests: 20, n: 1000, p: 0.1, alpha: 0.05, seed: 9 });
  assert(first.results.length === 20, '生成 20 次实验');
  assert(first.falsePositives === second.falsePositives, '相同种子结果可复现');
  assert(first.threshold === 0.05, '未校正阈值 = 0.05');
  assert(first.falsePositives <= 20, '假阳性数不超过实验次数');
  assert(first.minP >= 0 && first.minP <= 1, '最小 p 值合法');

  const corrected = runExperiment({ tests: 20, n: 1000, p: 0.1, alpha: 0.05, correction: true, seed: 9 });
  assertClose(corrected.threshold, 0.0025, 1e-12, 'Bonferroni 阈值 = 0.0025');
  assert(corrected.falsePositives <= first.falsePositives, '校正后假阳性不会更多');
}

console.log('\n📍 理论概率与格式化');
{
  assertClose(expectedAtLeastOne(20, 0.05), 0.6415, 1e-4, '20 次检验至少一次假阳性 ≈ 64.15%');
  assertClose(expectedAtLeastOne(1, 0.05), 0.05, 1e-12, '1 次检验假阳性率 = 5%');
  assertClose(bonferroniAlpha(0.05, 20), 0.0025, 1e-12, 'Bonferroni 阈值计算正确');
  assert(bonferroniAlpha(0.05, 0) === 0.05, '零次检验时阈值回退到 alpha');
  assert(pStars(0.0005) === '***', 'p < 0.001 三颗星');
  assert(pStars(0.005) === '**', 'p < 0.01 两颗星');
  assert(pStars(0.03) === '*', 'p < 0.05 一颗星');
  assert(pStars(0.2) === '', '不显著没有星');
  assert(formatP(0.00001) === '< 0.0001', '极小 p 值格式化');
  assert(formatP(0.0234) === '0.0234', '普通 p 值保留四位小数');
}

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
process.exit(failed ? 1 : 0);
