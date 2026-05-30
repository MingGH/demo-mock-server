/**
 * Coupon Collector Logic - Unit Tests
 * 用 node 直接运行: node pages/coupon-collector.test.js
 */

const { expectedDraws, stageExpected, simulateOnce, simulateBatch, computeStats, buildHistogram } = require('./coupon-collector-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

function approx(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

// ========== expectedDraws ==========
console.log('\n📦 expectedDraws');

// n=1: 只有1种，抽1次就集齐
assert(expectedDraws(1) === 1, 'n=1 → 期望1次');

// n=2: 1 + 2/1 = 1 + 2 = 3 → E = 2*(1+1/2) = 3
assert(expectedDraws(2) === 3, 'n=2 → 期望3次');

// n=5: 5*(1+1/2+1/3+1/4+1/5) ≈ 11.42
assert(approx(expectedDraws(5), 11.4167, 0.01), 'n=5 → 期望≈11.42');

// n=10: 10*H(10) ≈ 29.29
assert(approx(expectedDraws(10), 29.2897, 0.01), 'n=10 → 期望≈29.29');

// n=50: 50*H(50) ≈ 224.96
assert(approx(expectedDraws(50), 224.96, 0.5), 'n=50 → 期望≈225');

// ========== stageExpected ==========
console.log('\n📊 stageExpected');

const stages5 = stageExpected(5);
assert(stages5.length === 5, 'n=5 有5个阶段');
assert(stages5[0].probability === 1, '第0阶段概率=1（必定新）');
assert(stages5[0].expected === 1, '第0阶段期望=1次');
assert(approx(stages5[4].probability, 0.2, 0.001), '第4阶段概率=0.2');
assert(approx(stages5[4].expected, 5, 0.001), '第4阶段期望=5次');

// 所有阶段期望之和 = expectedDraws(n)
const stageSum = stages5.reduce((s, st) => s + st.expected, 0);
assert(approx(stageSum, expectedDraws(5), 0.001), '阶段期望之和 = 总期望');

// ========== simulateOnce ==========
console.log('\n🎲 simulateOnce');

const sim1 = simulateOnce(5);
assert(sim1.totalDraws >= 5, '至少抽5次才能集齐5种');
assert(sim1.history.length === sim1.totalDraws + 1, 'history长度 = totalDraws+1');
assert(sim1.history[0] === 0, 'history[0] = 0');
assert(sim1.history[sim1.history.length - 1] === 5, '最后一项 = 5（集齐）');

// history 单调递增
let monotonic = true;
for (let i = 1; i < sim1.history.length; i++) {
  if (sim1.history[i] < sim1.history[i - 1]) { monotonic = false; break; }
}
assert(monotonic, 'history 单调不减');

// ========== simulateBatch ==========
console.log('\n🔁 simulateBatch');

const batch = simulateBatch(10, 5000);
assert(batch.length === 5000, '返回5000个结果');
assert(batch.every(v => v >= 10), '每次至少抽10次');

// 大数定律：均值应接近理论期望
const batchMean = batch.reduce((a, b) => a + b, 0) / batch.length;
const theory = expectedDraws(10);
assert(approx(batchMean, theory, 2), `批量均值(${batchMean.toFixed(1)})接近理论期望(${theory.toFixed(1)})`);

// ========== computeStats ==========
console.log('\n📈 computeStats');

const stats = computeStats(batch);
assert(approx(stats.mean, batchMean, 0.01), 'mean 正确');
assert(stats.min >= 10, 'min >= 10');
assert(stats.max >= stats.min, 'max >= min');
assert(stats.median >= stats.min && stats.median <= stats.max, 'median 在范围内');
assert(stats.p90 >= stats.median, 'p90 >= median');
assert(stats.p95 >= stats.p90, 'p95 >= p90');
assert(stats.p99 >= stats.p95, 'p99 >= p95');
assert(stats.stdDev > 0, '标准差 > 0');

// ========== buildHistogram ==========
console.log('\n📊 buildHistogram');

const hist = buildHistogram(batch, 20);
assert(hist.length === 20, '20个桶');
const totalCount = hist.reduce((s, b) => s + b.count, 0);
assert(totalCount === 5000, '桶内总数 = 5000');
assert(hist.every(b => b.lo < b.hi), '每个桶 lo < hi');

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
