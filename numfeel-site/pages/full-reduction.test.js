/**
 * 满减凑单计算器 — 单元测试
 * 用 node pages/full-reduction.test.js 直接运行
 */

const {
  analyzeFullReduction, analyzeTiers, simulateRegret,
  batchAnalyze, round2
} = require('./full-reduction-logic.js');

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

function approxEqual(a, b, tol = 0.1) {
  return Math.abs(a - b) <= tol;
}

// === round2 ===
console.log('\n📊 round2');
assert(round2(3.1415) === 3.14, 'round2(3.1415) = 3.14');
assert(round2(0.005) === 0.01, 'round2(0.005) = 0.01');
assert(round2(100) === 100, 'round2(100) = 100');

// === analyzeFullReduction 基本场景 ===
console.log('\n📊 analyzeFullReduction — 基本场景');

// 场景1：原价200，满300减50，需要凑100
const r1 = analyzeFullReduction(200, 300, 50);
assert(r1.needPadding === true, '200元需要凑单');
assert(r1.paddingAmount === 100, '需要凑100元');
assert(r1.actualPay === 250, '实付250元');
assert(r1.saved === 50, '省了50元');
assert(r1.wasted === 100, '多花了100元');
assert(r1.netSaving === -50, '净亏50元');
assert(r1.worthIt === false, '不划算');

// 场景2：原价280，满300减50，只需凑20
const r2 = analyzeFullReduction(280, 300, 50);
assert(r2.needPadding === true, '280元需要凑单');
assert(r2.paddingAmount === 20, '需要凑20元');
assert(r2.netSaving === 30, '净省30元');
assert(r2.worthIt === true, '划算');

// 场景3：原价350，已超过门槛
const r3 = analyzeFullReduction(350, 300, 50);
assert(r3.needPadding === false, '350元不需要凑单');
assert(r3.actualPay === 300, '实付300元');
assert(r3.saved === 50, '直接省50元');
assert(r3.worthIt === true, '直接划算');

// 场景4：原价刚好300
const r4 = analyzeFullReduction(300, 300, 50);
assert(r4.needPadding === false, '刚好300不需要凑单');
assert(r4.actualPay === 250, '实付250元');

// === analyzeFullReduction 边界情况 ===
console.log('\n📊 analyzeFullReduction — 边界情况');
const rErr1 = analyzeFullReduction(0, 300, 50);
assert(rErr1.error !== undefined, '原价0报错');
const rErr2 = analyzeFullReduction(200, 300, 300);
assert(rErr2.error !== undefined, '减免>=门槛报错');
const rErr3 = analyzeFullReduction(-100, 300, 50);
assert(rErr3.error !== undefined, '负数报错');

// === analyzeFullReduction 真实折扣率 ===
console.log('\n📊 真实折扣率计算');
// 原价150，满300减50：凑150，净亏100，真实折扣率 = -100/150*100 = -66.67%
const r5 = analyzeFullReduction(150, 300, 50);
assert(r5.realDiscount < 0, '原价150凑到300，真实折扣率为负');
assert(approxEqual(r5.realDiscount, -66.67, 0.1), `真实折扣率约-66.67%，实际${r5.realDiscount}%`);

// 原价290，满300减50：凑10，净省40，真实折扣率 = 40/290*100 ≈ 13.79%
const r6 = analyzeFullReduction(290, 300, 50);
assert(r6.realDiscount > 0, '原价290凑到300，真实折扣率为正');
assert(approxEqual(r6.netSaving, 40, 0.01), '净省40元');

// === analyzeTiers 多档满减 ===
console.log('\n📊 analyzeTiers — 多档满减');
const tiers = [
  { threshold: 200, discount: 20 },
  { threshold: 300, discount: 50 },
  { threshold: 500, discount: 100 }
];
const mt = analyzeTiers(180, tiers);
assert(mt.results.length === 3, '3个档位都有分析');
assert(mt.best !== null, '有最优推荐');
// 180元：满200减20只需凑20（净省0），满300减50需凑120（净亏70），满500减100需凑320（净亏220）
assert(mt.best.tier.threshold === 200, '最优档位是满200减20');

// === simulateRegret ===
console.log('\n📊 simulateRegret — 后悔概率模拟');
const sim = simulateRegret(150, 10000);
assert(sim.runs === 10000, '模拟10000次');
assert(sim.regretCount > 0, '有人后悔');
assert(sim.regretRate > 20 && sim.regretRate < 80, `后悔率${sim.regretRate}%在合理范围`);
assert(sim.avgRegretDay > 0 && sim.avgRegretDay <= 30, `平均后悔天数${sim.avgRegretDay}在合理范围`);
assert(sim.dayDistribution.length === 31, '天数分布数组长度31');

// 金额越大后悔率越高
const simLow = simulateRegret(30, 5000);
const simHigh = simulateRegret(500, 5000);
// 允许一定波动，但大趋势应该是金额大后悔率高
assert(simHigh.regretRate >= simLow.regretRate - 5,
  `高金额后悔率(${simHigh.regretRate}%) >= 低金额(${simLow.regretRate}%) - 5`);

// === batchAnalyze ===
console.log('\n📊 batchAnalyze — 批量分析');
const batch = batchAnalyze(300, 50, 50);
assert(batch.length > 0, '有分析结果');
// 价格从50到450，应该有多个数据点
assert(batch.length >= 5, `至少5个数据点，实际${batch.length}`);
// 价格低于300的需要凑单
const below = batch.filter(b => b.price < 300);
assert(below.every(b => b.needPadding), '低于门槛的都需要凑单');
// 价格>=300的不需要凑单
const above = batch.filter(b => b.price >= 300);
assert(above.every(b => !b.needPadding), '达到门槛的不需要凑单');
// 真实折扣率应该随价格增加而增加（在门槛以下）
assert(below[0].realDiscount < below[below.length - 1].realDiscount,
  '价格越接近门槛，真实折扣率越高');

// === 总结 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
