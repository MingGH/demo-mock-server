/**
 * Queue Theory Logic - Unit Tests
 * 用 node 直接运行: node pages/queue-theory.test.js
 */

const {
  mm1Metrics, simulateMultiQueue, simulateSingleQueue,
  simulateSwitchParadox, simulateQueueLuck,
  perceivedWaitTime, littlesLaw, exponentialRandom, computeWaitStats
} = require('./queue-theory-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

// ========== mm1Metrics ==========
console.log('\n📐 mm1Metrics');

const m1 = mm1Metrics(4, 5);
assert(approx(m1.rho, 0.8, 0.001), 'ρ = λ/μ = 4/5 = 0.8');
assert(approx(m1.Lq, 3.2, 0.01), 'Lq = ρ²/(1-ρ) = 3.2');
assert(approx(m1.Wq, 0.8, 0.01), 'Wq = Lq/λ = 0.8');
assert(approx(m1.L, 4, 0.01), 'L = ρ/(1-ρ) = 4');
assert(approx(m1.W, 1, 0.01), 'W = 1/(μ-λ) = 1');

const m2 = mm1Metrics(1, 2);
assert(approx(m2.rho, 0.5, 0.001), 'ρ = 0.5 when λ=1, μ=2');
assert(approx(m2.Lq, 0.5, 0.01), 'Lq = 0.5');
assert(approx(m2.L, 1, 0.01), 'L = 1');

// 过载情况
const m3 = mm1Metrics(5, 5);
assert(m3.rho === 1, 'λ=μ 时 ρ=1');
assert(m3.Lq === Infinity, 'λ=μ 时 Lq=∞');

const m4 = mm1Metrics(6, 5);
assert(m4.Wq === Infinity, 'λ>μ 时 Wq=∞');

// ========== littlesLaw ==========
console.log('\n📏 littlesLaw');
assert(approx(littlesLaw(4, 1), 4, 0.001), 'L = λ×W = 4×1 = 4');
assert(approx(littlesLaw(2, 0.5), 1, 0.001), 'L = 2×0.5 = 1');
// 验证 mm1 结果满足 Little's Law
assert(approx(m1.L, littlesLaw(4, m1.W), 0.01), 'mm1 结果满足 Little\'s Law');

// ========== exponentialRandom ==========
console.log('\n🎲 exponentialRandom');
const samples = [];
for (let i = 0; i < 10000; i++) samples.push(exponentialRandom(30));
const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
assert(approx(sampleMean, 30, 2), `指数分布均值(${sampleMean.toFixed(1)})接近30`);
assert(samples.every(s => s > 0), '所有样本 > 0');

// ========== computeWaitStats ==========
console.log('\n📊 computeWaitStats');
const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const stats = computeWaitStats(testData);
assert(approx(stats.avgWait, 5.5, 0.01), '均值 = 5.5');
assert(stats.minWait === 1, 'min = 1');
assert(stats.maxWait === 10, 'max = 10');
assert(stats.median === 6, '中位数 = 6');
assert(stats.stdDev > 0, '标准差 > 0');

// ========== simulateMultiQueue ==========
console.log('\n🏪 simulateMultiQueue');
const mq = simulateMultiQueue(3, 50, 30);
assert(mq.waitTimes.length === 50, '返回50个等待时间');
assert(mq.avgWait >= 0, '平均等待 >= 0');
assert(mq.maxWait >= mq.avgWait, 'max >= avg');
assert(mq.minWait >= 0, 'min >= 0');

// ========== simulateSingleQueue ==========
console.log('\n🏦 simulateSingleQueue');
const sq = simulateSingleQueue(3, 50, 30);
assert(sq.waitTimes.length === 50, '返回50个等待时间');
assert(sq.avgWait >= 0, '平均等待 >= 0');
assert(sq.maxWait >= sq.avgWait, 'max >= avg');

// 蛇形队列标准差应该更小（大样本验证）
let singleBetter = 0;
for (let trial = 0; trial < 30; trial++) {
  const mq2 = simulateMultiQueue(3, 500, 30);
  const sq2 = simulateSingleQueue(3, 500, 30);
  if (sq2.stdDev <= mq2.stdDev) singleBetter++;
}
assert(singleBetter >= 10, `蛇形队列标准差更小的比例: ${singleBetter}/30 (应>=10)`);

// ========== simulateSwitchParadox ==========
console.log('\n🔄 simulateSwitchParadox');
const sw = simulateSwitchParadox(5000, 3, 5);
assert(sw.stayWins + sw.switchWins + sw.ties === 5000, '总数 = 5000');
assert(sw.stayAvg > 0, '不换队平均时间 > 0');
assert(sw.switchAvg > 0, '换队平均时间 > 0');
assert(sw.switchAvg > sw.stayAvg, `换队平均(${sw.switchAvg.toFixed(0)}) > 不换队平均(${sw.stayAvg.toFixed(0)})`);
assert(sw.stayWinRate > sw.switchWinRate, `不换队胜率(${(sw.stayWinRate*100).toFixed(1)}%) > 换队胜率(${(sw.switchWinRate*100).toFixed(1)}%)`);

// ========== simulateQueueLuck ==========
console.log('\n🍀 simulateQueueLuck');
const luck3 = simulateQueueLuck(5000, 3);
assert(approx(luck3.fastestProb, 1/3, 0.05), `3队最快概率(${(luck3.fastestProb*100).toFixed(1)}%)接近33.3%`);
assert(approx(luck3.notFastestProb, 2/3, 0.05), `3队不是最快概率(${(luck3.notFastestProb*100).toFixed(1)}%)接近66.7%`);

const luck5 = simulateQueueLuck(5000, 5);
assert(approx(luck5.fastestProb, 1/5, 0.05), `5队最快概率(${(luck5.fastestProb*100).toFixed(1)}%)接近20%`);
assert(luck5.notFastestProb > 0.7, `5队不是最快概率 > 70%`);

const luck10 = simulateQueueLuck(5000, 10);
assert(luck10.fastestProb < 0.2, `10队最快概率 < 20%`);
assert(luck10.notFastestProb > 0.8, `10队不是最快概率 > 80%`);

// ========== perceivedWaitTime ==========
console.log('\n🧠 perceivedWaitTime');

// 无任何因素：感知 = 实际
const p0 = perceivedWaitTime(10, {});
assert(approx(p0, 10, 0.01), '无因素时感知=实际');

// 全部负面因素
const pBad = perceivedWaitTime(10, { uncertain: true, bored: true, unfair: true, anxious: true });
assert(pBad > 10, `全负面因素: ${pBad.toFixed(1)} > 10`);
assert(approx(pBad, 10 * (1 + 0.4 + 0.3 + 0.5 + 0.35), 0.01), '全负面 = 10 × 2.55 = 25.5');

// 全部正面因素
const pGood = perceivedWaitTime(10, { progressBar: true, entertainment: true, preService: true });
assert(pGood < 10, `全正面因素: ${pGood.toFixed(1)} < 10`);
assert(approx(pGood, 10 * (1 - 0.2 - 0.25 - 0.15), 0.01), '全正面 = 10 × 0.4 = 4.0');

// 混合因素
const pMix = perceivedWaitTime(10, { uncertain: true, entertainment: true });
assert(approx(pMix, 10 * (1 + 0.4 - 0.25), 0.01), '混合 = 10 × 1.15 = 11.5');

// 最低不低于 0.3 倍
const pMin = perceivedWaitTime(10, { progressBar: true, entertainment: true, preService: true, uncertain: false });
assert(pMin >= 10 * 0.3, `最低感知 >= 实际×0.3`);

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
