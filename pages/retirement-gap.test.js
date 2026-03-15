/**
 * retirement-gap-logic.js 单元测试
 * 运行方式：node pages/retirement-gap.test.js
 */

const RGL = require('./retirement-gap-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  \u2713 ' + msg);
    passed++;
  } else {
    console.error('  \u2717 ' + msg);
    failed++;
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg + ' (got ' + a.toFixed(2) + ', expected ~' + b + ')');
}

// ========== gaussianRandom ==========
console.log('\n[gaussianRandom]');
var samples = [];
for (var i = 0; i < 10000; i++) samples.push(RGL.gaussianRandom(0, 1));
var mean = samples.reduce(function(s, v) { return s + v; }, 0) / samples.length;
var variance = samples.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / samples.length;
assertClose(mean, 0, 0.1, 'mean ≈ 0');
assertClose(Math.sqrt(variance), 1, 0.1, 'std ≈ 1');

// ========== simulateOnce ==========
console.log('\n[simulateOnce]');
var baseParams = {
  currentAge: 30,
  retireAge: 60,
  lifeExpectancy: 100,
  currentSavings: 100000,
  monthlySaving: 3000,
  monthlyExpense: 5000,
  annualReturn: 0.05,
  returnStd: 0,       // 无波动，确定性
  inflationRate: 0.03,
  inflationStd: 0,
  pensionMonthly: 2000,
  emergencyRate: 0,
  emergencyAmount: 0
};

var r1 = RGL.simulateOnce(baseParams);
assert(r1.depletionAge > baseParams.retireAge, 'depletion age > retire age (' + r1.depletionAge + ')');
assert(r1.depletionAge <= 100, 'depletion age <= 100 (' + r1.depletionAge + ')');
assert(r1.peakWealth > 0, 'peak wealth > 0');
assert(r1.wealthAtRetire > 0, 'wealth at retire > 0');
assert(r1.wealthPath.length > 0, 'wealth path has data');
assert(r1.wealthPath[0].age === 30, 'path starts at current age');

// 零储蓄零收入应该很快花完
var r2 = RGL.simulateOnce({
  currentAge: 60, retireAge: 60, lifeExpectancy: 100,
  currentSavings: 120000, monthlySaving: 0, monthlyExpense: 5000,
  annualReturn: 0, returnStd: 0, inflationRate: 0, inflationStd: 0,
  pensionMonthly: 0, emergencyRate: 0, emergencyAmount: 0
});
// 120000 / (5000*12) = 2 年
assertClose(r2.depletionAge, 62, 1, 'zero return: 120k / 60k per year ≈ 62');

// 养老金覆盖支出 → 永远不会花完
var r3 = RGL.simulateOnce({
  currentAge: 60, retireAge: 60, lifeExpectancy: 100,
  currentSavings: 100000, monthlySaving: 0, monthlyExpense: 3000,
  annualReturn: 0.05, returnStd: 0, inflationRate: 0.03, inflationStd: 0,
  pensionMonthly: 5000, emergencyRate: 0, emergencyAmount: 0
});
assert(r3.depletionAge === 100, 'pension > expense: survives to 100 (' + r3.depletionAge + ')');

// ========== deterministicEstimate ==========
console.log('\n[deterministicEstimate]');
var d1 = RGL.deterministicEstimate(baseParams);
assert(d1.depletionAge > baseParams.retireAge, 'deterministic: depletion > retire (' + d1.depletionAge + ')');
assert(d1.wealthAtRetire > 0, 'deterministic: wealth at retire > 0');
assert(d1.path.length > 0, 'deterministic: path has data');
assert(d1.path[0].age === 30, 'deterministic: path starts at 30');

// 确定性和无波动模拟应该一致
assertClose(d1.depletionAge, r1.depletionAge, 1, 'deterministic ≈ zero-volatility simulation');

// ========== monteCarloRetirement ==========
console.log('\n[monteCarloRetirement]');
var mcParams = {
  currentAge: 30, retireAge: 60, lifeExpectancy: 100,
  currentSavings: 200000, monthlySaving: 5000, monthlyExpense: 6000,
  annualReturn: 0.06, returnStd: 0.12,
  inflationRate: 0.03, inflationStd: 0.01,
  pensionMonthly: 3000, emergencyRate: 0.05, emergencyAmount: 50000
};
var mc = RGL.monteCarloRetirement(mcParams, 2000);

assert(mc.trials === 2000, 'trials = 2000');
assert(mc.ages.length === 2000, 'ages array length = 2000');
assert(mc.avgDepletionAge > 60, 'avg depletion > 60 (' + mc.avgDepletionAge.toFixed(1) + ')');
assert(mc.avgDepletionAge <= 100, 'avg depletion <= 100');
assert(mc.medianDepletionAge > 60, 'median > 60 (' + mc.medianDepletionAge + ')');
assert(mc.p10 <= mc.p25, 'p10 <= p25');
assert(mc.p25 <= mc.medianDepletionAge, 'p25 <= median');
assert(mc.medianDepletionAge <= mc.p75, 'median <= p75');
assert(mc.p75 <= mc.p90, 'p75 <= p90');
assert(mc.survivalRate >= 0 && mc.survivalRate <= 1, 'survival rate in [0,1]');
assert(mc.survivalPercent >= 0 && mc.survivalPercent <= 100, 'survival percent in [0,100]');
assert(mc.avgWealthAtRetire > 0, 'avg wealth at retire > 0');
assert(mc.samplePaths.length > 0 && mc.samplePaths.length <= 20, 'sample paths 1-20');
assert(Object.keys(mc.buckets).length > 0, 'buckets has data');

// sorted
var sorted = true;
for (var s = 1; s < mc.ages.length; s++) {
  if (mc.ages[s] < mc.ages[s - 1]) { sorted = false; break; }
}
assert(sorted, 'ages array is sorted');

// ========== requiredSavings ==========
console.log('\n[requiredSavings]');
var req1 = RGL.requiredSavings({
  retireAge: 60, monthlyExpense: 5000, annualReturn: 0.05,
  inflationRate: 0.03, pensionMonthly: 2000
}, 85);
assert(req1 > 0, 'required savings > 0 (¥' + req1.toFixed(0) + ')');
// 25 年 * (5000-2000)*12 = 900000 无回报情况下
assert(req1 < 900000, 'with returns, need less than no-return case');

// 养老金覆盖支出 → 不需要储蓄
var req2 = RGL.requiredSavings({
  retireAge: 60, monthlyExpense: 3000, annualReturn: 0.05,
  inflationRate: 0.03, pensionMonthly: 5000
}, 85);
assert(req2 === 0, 'pension > expense: required = 0');

// 目标年龄 <= 退休年龄 → 0
var req3 = RGL.requiredSavings({
  retireAge: 60, monthlyExpense: 5000, annualReturn: 0.05,
  inflationRate: 0.03, pensionMonthly: 2000
}, 55);
assert(req3 === 0, 'target <= retire: required = 0');

// 更长退休期需要更多储蓄
var req4 = RGL.requiredSavings({
  retireAge: 60, monthlyExpense: 5000, annualReturn: 0.05,
  inflationRate: 0.03, pensionMonthly: 2000
}, 95);
assert(req4 > req1, 'longer retirement needs more savings');

// ========== sensitivityAnalysis ==========
console.log('\n[sensitivityAnalysis]');
var sa = RGL.sensitivityAnalysis(mcParams, 500);
assert(sa.base.avgAge > 60, 'base avg age > 60');
assert(sa.base.survivalRate >= 0, 'base survival >= 0');
assert(sa.scenarios.length === 6, '6 scenarios');
assert(sa.scenarios.every(function(s) { return s.name && typeof s.avgAge === 'number'; }), 'all scenarios have name and avgAge');

// 多存钱应该延长
var moreSaving = sa.scenarios.find(function(s) { return s.name === '多存 ¥1000/月'; });
assert(moreSaving.delta > 0, 'more saving = longer (' + moreSaving.delta.toFixed(1) + ' years)');

// 少花钱应该延长
var lessSpend = sa.scenarios.find(function(s) { return s.name === '少花 ¥1000/月'; });
assert(lessSpend.delta > 0, 'less spending = longer (' + lessSpend.delta.toFixed(1) + ' years)');

// 延迟退休应该延长
var laterRetire = sa.scenarios.find(function(s) { return s.name === '延迟退休 5 年'; });
assert(laterRetire.delta > 0, 'later retire = longer (' + laterRetire.delta.toFixed(1) + ' years)');

// 通胀增加应该缩短
var moreInflation = sa.scenarios.find(function(s) { return s.name === '通胀率 +1%'; });
assert(moreInflation.delta < 0, 'more inflation = shorter (' + moreInflation.delta.toFixed(1) + ' years)');

// --- 汇总 ---
console.log('\n' + '='.repeat(40));
console.log('测试结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
