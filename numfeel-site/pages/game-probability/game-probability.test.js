/**
 * 游戏概率策略模拟器 — 单元测试
 * 运行: node pages/game-probability/game-probability.test.js
 */

const {
  simulatePull, simulateUntilHit, batchSimulate, calcStats,
  histogram, cumulativeProb, strategySimulate,
  theoreticalExpected, probWithinN, streakProbability
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { passed++; console.log(`  ✓ ${msg} (${actual.toFixed(4)} ≈ ${expected})`); }
  else { failed++; console.error(`  ✗ ${msg} — got ${actual.toFixed(4)}, expected ~${expected} ±${tolerance}`); }
}

// ── simulatePull ──
console.log('\n[simulatePull]');

assert(
  simulatePull(0.006, 89, 73, 90, 0.06).hit === true,
  '硬保底第90抽必出'
);

assert(
  simulatePull(0.006, 0, 73, 90, 0.06).newPity === 1 || simulatePull(0.006, 0, 73, 90, 0.06).hit === true,
  '第1抽返回合法结果'
);

// 软保底后概率提升
const softResult = simulatePull(1.0, 74, 73, 90, 0.06); // rate=1 必出
assert(softResult.hit === true, '概率为1时必出');

// ── simulateUntilHit ──
console.log('\n[simulateUntilHit]');

const config90 = { baseRate: 0.006, softPity: 73, hardPity: 90, softPityRate: 0.06, fiftyFifty: false };
const pulls = simulateUntilHit(config90);
assert(pulls >= 1 && pulls <= 90, `无50/50时抽数在1~90之间 (got ${pulls})`);

const config5050 = { baseRate: 0.006, softPity: 73, hardPity: 90, softPityRate: 0.06, fiftyFifty: true };
const pulls5050 = simulateUntilHit(config5050);
assert(pulls5050 >= 1 && pulls5050 <= 180, `有50/50时抽数在1~180之间 (got ${pulls5050})`);

// ── batchSimulate ──
console.log('\n[batchSimulate]');

const batch = batchSimulate(config90, 1000);
assert(batch.length === 1000, '返回正确数量');
assert(batch.every(v => v >= 1 && v <= 90), '所有值在合法范围');

// 均值应该在60~85之间（有软保底的原神模型）
const batchMean = batch.reduce((a, b) => a + b, 0) / batch.length;
assert(batchMean > 40 && batchMean < 85, `均值合理: ${batchMean.toFixed(1)}`);

// ── calcStats ──
console.log('\n[calcStats]');

const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const stats = calcStats(testData);
assertApprox(stats.mean, 5.5, 0.01, '均值计算');
assert(stats.median === 6, `中位数: ${stats.median}`);
assert(stats.min === 1, '最小值');
assert(stats.max === 10, '最大值');

// ── histogram ──
console.log('\n[histogram]');

const histData = [1, 2, 3, 11, 12, 13, 21, 22, 23, 24];
const hist = histogram(histData, 10);
assert(hist.counts[0] === 3, `第一个bin有3个: ${hist.counts[0]}`);
assert(hist.counts[1] === 3, `第二个bin有3个: ${hist.counts[1]}`);
assert(hist.counts[2] === 4, `第三个bin有4个: ${hist.counts[2]}`);
assertApprox(hist.freqs[0], 0.3, 0.01, '频率计算');

// ── cumulativeProb ──
console.log('\n[cumulativeProb]');

const cdfData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const cdf = cumulativeProb(cdfData, 10);
assertApprox(cdf.y[0], 0.1, 0.01, 'CDF at 1');
assertApprox(cdf.y[4], 0.5, 0.01, 'CDF at 5');
assertApprox(cdf.y[9], 1.0, 0.01, 'CDF at 10');

// ── theoreticalExpected ──
console.log('\n[theoreticalExpected]');

assertApprox(theoreticalExpected(0.01), 100, 0.01, '1%概率期望100次');
assertApprox(theoreticalExpected(0.5), 2, 0.01, '50%概率期望2次');

// ── probWithinN ──
console.log('\n[probWithinN]');

assertApprox(probWithinN(0.01, 100), 0.634, 0.01, '1%概率100次内出的概率≈63.4%');
assertApprox(probWithinN(0.01, 230), 0.9, 0.02, '1%概率230次内出的概率≈90%');

// ── streakProbability ──
console.log('\n[streakProbability]');

assertApprox(streakProbability(0.01, 100), 0.366, 0.01, '1%概率连续100次不出≈36.6%');
assertApprox(streakProbability(0.5, 10), 0.000977, 0.0001, '50%概率连续10次不出≈0.1%');

// ── strategySimulate ──
console.log('\n[strategySimulate]');

const stratConfig = { baseRate: 0.006, softPity: 73, hardPity: 90, softPityRate: 0.06, fiftyFifty: false };
const yoloResult = strategySimulate(stratConfig, 180, 'yolo');
assert(yoloResult.characters >= 0, `yolo策略返回合法角色数: ${yoloResult.characters}`);
assert(yoloResult.pulls <= 180, `yolo策略不超预算: ${yoloResult.pulls}`);

const discountResult = strategySimulate(stratConfig, 180, 'discount');
assert(discountResult.characters >= 0, `discount策略返回合法角色数: ${discountResult.characters}`);

// ── 大样本验证：原神模型期望 ──
console.log('\n[大样本验证]');

const largeBatch = batchSimulate(config5050, 10000);
const largeMean = largeBatch.reduce((a, b) => a + b, 0) / largeBatch.length;
// 原神有50/50的期望大约在80~100之间
assert(largeMean > 60 && largeMean < 120, `原神50/50模型期望合理: ${largeMean.toFixed(1)}`);

// 无保底3%模型
const noPityConfig = { baseRate: 0.03, softPity: 9999, hardPity: 9999, softPityRate: 0, fiftyFifty: false };
const noPityBatch = batchSimulate(noPityConfig, 5000);
const noPityMean = noPityBatch.reduce((a, b) => a + b, 0) / noPityBatch.length;
// 理论期望 = 1/0.03 ≈ 33.3
assertApprox(noPityMean, 33.3, 3, '3%无保底期望≈33.3');

// ── 结果 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
