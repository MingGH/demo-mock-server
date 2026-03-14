/**
 * subscription-audit-logic.js 单元测试
 * 运行方式：node pages/subscription-audit.test.js
 */

const SAL = require('./subscription-audit-logic.js');

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
  assert(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', expected ~' + b + ')');
}

// ========== PRESET_SERVICES ==========
console.log('\n[PRESET_SERVICES]');
assert(SAL.PRESET_SERVICES.length > 20, 'preset services count > 20 (' + SAL.PRESET_SERVICES.length + ')');
assert(SAL.PRESET_SERVICES.every(function(s) { return s.name && s.price > 0 && s.category && s.icon; }),
  'all presets have name, price, category, icon');
var categories = SAL.PRESET_SERVICES.map(function(s) { return s.category; });
var uniqueCats = categories.filter(function(c, i) { return categories.indexOf(c) === i; });
assert(uniqueCats.length >= 8, 'at least 8 categories (' + uniqueCats.length + ')');

// ========== CATEGORIES ==========
console.log('\n[CATEGORIES]');
assert(Object.keys(SAL.CATEGORIES).length >= 8, 'CATEGORIES has 8+ entries');
assert(SAL.CATEGORIES.video === '视频', 'video category label correct');

// ========== forgettingCurve ==========
console.log('\n[forgettingCurve]');
assertClose(SAL.forgettingCurve(0, 30), 1, 0.001, 'R(0) = 1');
assertClose(SAL.forgettingCurve(30, 30), Math.exp(-1), 0.001, 'R(S) = e^-1 ≈ 0.368');
assert(SAL.forgettingCurve(60, 30) < SAL.forgettingCurve(30, 30), 'R(60) < R(30)');
assert(SAL.forgettingCurve(90, 30) < 0.06, 'R(90, S=30) < 6%');
assert(SAL.forgettingCurve(-5, 30) === 1, 'negative t returns 1');
// 不同稳定性参数
assert(SAL.forgettingCurve(30, 60) > SAL.forgettingCurve(30, 30), 'higher S = slower forgetting');
assert(SAL.forgettingCurve(30, 15) < SAL.forgettingCurve(30, 30), 'lower S = faster forgetting');

// ========== expectedUsageDays ==========
console.log('\n[expectedUsageDays]');
var usage12 = SAL.expectedUsageDays(12, 30, 20);
assert(usage12 > 0, 'expected usage days > 0 (' + usage12.toFixed(1) + ')');
assert(usage12 < 12 * 20, 'expected usage < max possible (' + usage12.toFixed(1) + ' < ' + (12*20) + ')');
// 高稳定性应该有更多使用天数
var usageHigh = SAL.expectedUsageDays(12, 90, 20);
assert(usageHigh > usage12, 'higher S = more usage days (' + usageHigh.toFixed(1) + ' > ' + usage12.toFixed(1) + ')');
// 0 个月应该返回 0
assert(SAL.expectedUsageDays(0, 30, 20) === 0, '0 months = 0 usage');

// ========== costPerUse ==========
console.log('\n[costPerUse]');
assertClose(SAL.costPerUse(30, 30), 1, 0.001, '¥30/月 用30天 = ¥1/次');
assertClose(SAL.costPerUse(30, 10), 3, 0.001, '¥30/月 用10天 = ¥3/次');
assertClose(SAL.costPerUse(30, 1), 30, 0.001, '¥30/月 用1天 = ¥30/次');
assert(SAL.costPerUse(30, 0) === Infinity, '0 usage = Infinity cost');

// ========== calculateAnnualWaste ==========
console.log('\n[calculateAnnualWaste]');
var subs1 = [
  { name: 'A', price: 30, usageDays: 30 },
  { name: 'B', price: 30, usageDays: 0 },
  { name: 'C', price: 30, usageDays: 15 }
];
var result1 = SAL.calculateAnnualWaste(subs1);
assert(result1.totalAnnual === 1080, 'total annual = 1080 (' + result1.totalAnnual + ')');
// A: 0 waste, B: 360 waste, C: 180 waste = 540 total waste
assertClose(result1.totalWaste, 540, 1, 'total waste = 540');
assertClose(result1.wastePercent, 50, 1, 'waste percent = 50%');
assert(result1.details.length === 3, '3 detail items');
// sorted by waste descending
assert(result1.details[0].waste >= result1.details[1].waste, 'sorted by waste desc');

// verdict checks
var detailA = result1.details.find(function(d) { return d.name === 'A'; });
var detailB = result1.details.find(function(d) { return d.name === 'B'; });
var detailC = result1.details.find(function(d) { return d.name === 'C'; });
assert(detailA.verdict === 'keep', 'A (30 days) = keep');
assert(detailB.verdict === 'cancel', 'B (0 days) = cancel');
assert(detailC.verdict === 'review', 'C (15 days) = review');

// empty list
var resultEmpty = SAL.calculateAnnualWaste([]);
assert(resultEmpty.totalAnnual === 0, 'empty list: total = 0');
assert(resultEmpty.totalWaste === 0, 'empty list: waste = 0');
assert(resultEmpty.wastePercent === 0, 'empty list: percent = 0');

// ========== sunkCostAnalysis ==========
console.log('\n[sunkCostAnalysis]');
var sunk1 = SAL.sunkCostAnalysis(30, 6, 20, 12);
assert(sunk1.sunkCost === 180, 'sunk cost = 180');
assert(sunk1.futureCostIfKeep === 360, 'future cost = 360');
assert(sunk1.futureValueIfKeep > 0, 'future value > 0 (' + sunk1.futureValueIfKeep.toFixed(1) + ')');
assert(sunk1.roi > 0, 'ROI > 0');
assert(['keep', 'review', 'cancel'].indexOf(sunk1.recommendation) >= 0, 'valid recommendation');

// 不用的服务应该建议取消
var sunk2 = SAL.sunkCostAnalysis(30, 6, 0, 12);
assert(sunk2.recommendation === 'cancel', '0 usage = cancel');
assert(sunk2.futureValueIfKeep === 0, '0 usage = 0 future value');

// 高使用率应该建议保留
var sunk3 = SAL.sunkCostAnalysis(30, 6, 28, 12);
assert(sunk3.recommendation === 'keep', 'high usage = keep');

// ========== generateForgettingCurveData ==========
console.log('\n[generateForgettingCurveData]');
var curveData = SAL.generateForgettingCurveData(30, 365, 5);
assert(curveData.length > 0, 'returns data points (' + curveData.length + ')');
assert(curveData[0].day === 0, 'starts at day 0');
assert(curveData[0].retention === 1, 'retention at day 0 = 1');
assert(curveData[curveData.length - 1].day === 365, 'ends at day 365');
assert(curveData[curveData.length - 1].retention < 0.01, 'retention at 365 days very low');
// monotonically decreasing
var decreasing = true;
for (var i = 1; i < curveData.length; i++) {
  if (curveData[i].retention > curveData[i-1].retention) { decreasing = false; break; }
}
assert(decreasing, 'retention is monotonically decreasing');

// step size
var curve1 = SAL.generateForgettingCurveData(30, 100, 10);
assert(curve1[1].day - curve1[0].day === 10, 'step size = 10');

// ========== subscriptionFatigueIndex ==========
console.log('\n[subscriptionFatigueIndex]');
// empty
var fi0 = SAL.subscriptionFatigueIndex([]);
assert(fi0.score === 100, 'empty = 100 score');
assert(fi0.level === 'healthy', 'empty = healthy');

// all high usage
var fiGood = SAL.subscriptionFatigueIndex([
  { price: 25, usageDays: 28 },
  { price: 15, usageDays: 25 }
]);
assert(fiGood.score >= 70, 'high usage = high score (' + fiGood.score + ')');
assert(fiGood.level === 'healthy' || fiGood.level === 'warning', 'high usage = healthy or warning');

// all zero usage
var fiBad = SAL.subscriptionFatigueIndex([
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 },
  { price: 100, usageDays: 0 }
]);
assert(fiBad.score < 30, 'all zero usage = low score (' + fiBad.score + ')');
assert(fiBad.level === 'critical' || fiBad.level === 'danger', 'all zero = critical or danger');

// score is clamped 0-100
assert(fiGood.score >= 0 && fiGood.score <= 100, 'score in [0,100]');
assert(fiBad.score >= 0 && fiBad.score <= 100, 'score in [0,100]');

// ========== wasteEquivalents ==========
console.log('\n[wasteEquivalents]');
var equivs = SAL.wasteEquivalents(1500);
assert(equivs.length === 5, '5 equivalents');
assert(equivs.every(function(e) { return e.item && e.count >= 0 && e.icon; }), 'all have item, count, icon');
var teaCups = equivs.find(function(e) { return e.item === '杯奶茶'; });
assert(teaCups.count === 100, '¥1500 = 100 cups of milk tea (' + teaCups.count + ')');
var hotpot = equivs.find(function(e) { return e.item === '顿火锅'; });
assert(hotpot.count === 12, '¥1500 = 12 hotpots (' + hotpot.count + ')');

// zero amount
var equivs0 = SAL.wasteEquivalents(0);
assert(equivs0.every(function(e) { return e.count === 0; }), '¥0 = 0 everything');

// ========== monteCarloSubscriptionWaste ==========
console.log('\n[monteCarloSubscriptionWaste]');
var mc = SAL.monteCarloSubscriptionWaste(1000, 12);
assert(mc.wastes.length === 1000, '1000 samples');
assert(mc.avgWaste > 0, 'avg waste > 0 (¥' + mc.avgWaste.toFixed(0) + ')');
assert(mc.medianWaste > 0, 'median waste > 0 (¥' + mc.medianWaste.toFixed(0) + ')');
assert(mc.p90Waste > mc.medianWaste, 'P90 > median');
assert(mc.avgSubCount >= 3 && mc.avgSubCount <= 10, 'avg sub count in [3,10] (' + mc.avgSubCount.toFixed(1) + ')');
assert(mc.avgActiveCount <= mc.avgSubCount, 'active <= total');
assert(mc.avgActiveCount > 0, 'some active subs');

// sorted
var mcSorted = true;
for (var k = 1; k < mc.wastes.length; k++) {
  if (mc.wastes[k] < mc.wastes[k-1]) { mcSorted = false; break; }
}
assert(mcSorted, 'monte carlo results sorted');

// reasonable range: avg waste should be between ¥500 and ¥15000
assert(mc.avgWaste > 500 && mc.avgWaste < 15000,
  'avg waste in reasonable range (¥' + mc.avgWaste.toFixed(0) + ')');

// ========== 综合场景测试 ==========
console.log('\n[综合场景：典型年轻人订阅]');
var typicalSubs = [
  { name: '爱奇艺', price: 25, usageDays: 3 },
  { name: 'B站大会员', price: 25, usageDays: 20 },
  { name: '网易云音乐', price: 15, usageDays: 25 },
  { name: 'iCloud 200GB', price: 21, usageDays: 30 },
  { name: 'ChatGPT Plus', price: 140, usageDays: 15 },
  { name: '知乎盐选', price: 25, usageDays: 2 },
  { name: '美团会员', price: 15, usageDays: 12 },
  { name: 'Keep会员', price: 19, usageDays: 1 }
];
var typicalResult = SAL.calculateAnnualWaste(typicalSubs);
assert(typicalResult.totalAnnual > 3000, 'typical annual > ¥3000 (¥' + typicalResult.totalAnnual.toFixed(0) + ')');
assert(typicalResult.totalWaste > 1000, 'typical waste > ¥1000 (¥' + typicalResult.totalWaste.toFixed(0) + ')');
assert(typicalResult.wastePercent > 20, 'typical waste% > 20% (' + typicalResult.wastePercent.toFixed(1) + '%)');

// 爱奇艺和知乎盐选应该建议取消（使用率很低）
var iqiyi = typicalResult.details.find(function(d) { return d.name === '爱奇艺'; });
var zhihu = typicalResult.details.find(function(d) { return d.name === '知乎盐选'; });
var keep = typicalResult.details.find(function(d) { return d.name === 'Keep会员'; });
assert(iqiyi.verdict === 'cancel', '爱奇艺(3天) should cancel');
assert(zhihu.verdict === 'cancel', '知乎盐选(2天) should cancel');
assert(keep.verdict === 'cancel', 'Keep(1天) should cancel');

// iCloud 应该保留（每天都用）
var icloud = typicalResult.details.find(function(d) { return d.name === 'iCloud 200GB'; });
assert(icloud.verdict === 'keep', 'iCloud(30天) should keep');
assert(icloud.waste === 0, 'iCloud waste = 0');

// B站应该保留
var bili = typicalResult.details.find(function(d) { return d.name === 'B站大会员'; });
assert(bili.verdict === 'keep', 'B站(20天) should keep');

// ChatGPT 应该是 review（15天 = 50%使用率）
var gpt = typicalResult.details.find(function(d) { return d.name === 'ChatGPT Plus'; });
assert(gpt.verdict === 'review', 'ChatGPT(15天) should review');
// ChatGPT 浪费金额应该最高（因为单价最贵且使用率50%）
assert(gpt.waste > iqiyi.waste, 'ChatGPT waste > 爱奇艺 waste');

// 健康度
var typicalFatigue = SAL.subscriptionFatigueIndex(typicalSubs);
assert(typicalFatigue.score > 0 && typicalFatigue.score < 100, 'fatigue score reasonable (' + typicalFatigue.score + ')');

// --- 汇总 ---
console.log('\n' + '='.repeat(40));
console.log('测试结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
