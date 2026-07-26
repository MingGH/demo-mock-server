/**
 * 奶茶店扎堆（Hotelling 线性城市模型）单元测试
 * 运行：node pages/boba-clustering/boba-clustering.test.js
 */
'use strict';

var engine = require('./engine.js');
var marketShares = engine.marketShares;
var avgCustomerDistance = engine.avgCustomerDistance;
var bestResponse = engine.bestResponse;
var socialOptimum = engine.socialOptimum;
var nashEquilibrium2 = engine.nashEquilibrium2;
var simulateConvergence = engine.simulateConvergence;
var hasPureNashEquilibrium = engine.hasPureNashEquilibrium;
var compareStrategies = engine.compareStrategies;
var shareInequality = engine.shareInequality;
var randomPositions = engine.randomPositions;

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log('✅ ' + msg + ' (实际=' + actual.toFixed(4) + ')'); }
  else { failed++; console.error('❌ ' + msg + ' 期望≈' + expected + ' 实际=' + actual + ' 容差=' + tol); }
}
function assertArrClose(actual, expected, tol, msg) {
  var ok = actual.length === expected.length &&
    actual.every(function (v, i) { return Math.abs(v - expected[i]) <= tol; });
  if (ok) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg + ' 期望≈[' + expected.join(',') + '] 实际=[' + actual.join(',') + ']'); }
}

console.log('\n=== marketShares ===');
// 2 家对称
assertArrClose(marketShares([0.25, 0.75]), [0.5, 0.5], 1e-9, '2家[0.25,0.75] 各占一半');
// 2 家同位置（纳什均衡）
assertArrClose(marketShares([0.5, 0.5]), [0.5, 0.5], 1e-9, '2家同在0.5 平分市场');
// 顺序无关
assertArrClose(marketShares([0.75, 0.25]), [0.5, 0.5], 1e-9, '2家顺序不影响份额');
// 2 家都在左端
assertArrClose(marketShares([0, 0]), [0.5, 0.5], 1e-9, '2家同在0 平分');
// 3 家均匀
assertArrClose(marketShares([1 / 6, 0.5, 5 / 6]), [1 / 3, 1 / 3, 1 / 3], 1e-9, '3家均匀各1/3');
// 3 家同位置
assertArrClose(marketShares([0.5, 0.5, 0.5]), [1 / 3, 1 / 3, 1 / 3], 1e-9, '3家同位置各1/3');
// 3 家 [0, 0.5, 1]：中店吃中间大块
assertArrClose(marketShares([0, 0.5, 1]), [0.25, 0.5, 0.25], 1e-9, '3家[0,0.5,1] 中店占0.5');
// 1 家
assertArrClose(marketShares([0.3]), [1], 1e-9, '1家独占全部市场');
// 份额总和=1
var s = marketShares([0.1, 0.4, 0.55, 0.9]);
assert(Math.abs(s.reduce(function (a, b) { return a + b; }, 0) - 1) < 1e-9, '任意位置份额总和=1');

console.log('\n=== avgCustomerDistance ===');
// 2家社会最优 [0.25,0.75] 理论值 1/8 = 0.125
assertClose(avgCustomerDistance([0.25, 0.75], 4000), 0.125, 0.002, '2家[0.25,0.75] 平均距离≈1/8');
// 2家纳什 [0.5,0.5] 理论值 0.25
assertClose(avgCustomerDistance([0.5, 0.5], 4000), 0.25, 0.002, '2家[0.5,0.5] 平均距离≈0.25');
// 纳什距离是社会最优的 2 倍
var dNash = avgCustomerDistance([0.5, 0.5], 4000);
var dSoc = avgCustomerDistance([0.25, 0.75], 4000);
assertClose(dNash / dSoc, 2.0, 0.02, '扎堆后平均走路距离是社会最优的2倍');
// 单家在中间 [0.5] 理论值 0.25
assertClose(avgCustomerDistance([0.5], 4000), 0.25, 0.002, '1家在中间 平均距离0.25');
// 3家社会最优 [1/6,1/2,5/6] 理论值 1/12≈0.0833
assertClose(avgCustomerDistance([1 / 6, 0.5, 5 / 6], 4000), 1 / 12, 0.002, '3家社会最优 平均距离≈1/12');

console.log('\n=== bestResponse ===');
// 对手在 0.8，店 i 应紧贴 0.8 左侧或右侧抢占；最优响应应非常接近 0.8
var br1 = bestResponse([0.5, 0.8], 0);
assert(Math.abs(br1 - 0.8) < 0.01 || Math.abs(br1 - 0.8) < 0.01, '对手在0.8 最优响应紧贴0.8 (得' + br1.toFixed(3) + ')');
// 对手在 0.2，最优响应紧贴 0.2
var br2 = bestResponse([0.5, 0.2], 0);
assert(Math.abs(br2 - 0.2) < 0.01, '对手在0.2 最优响应紧贴0.2 (得' + br2.toFixed(3) + ')');
// 对手在 0.5（中间），最优响应也是 0.5（扎堆中间）
var br3 = bestResponse([0.0, 0.5], 0);
assertClose(br3, 0.5, 0.01, '对手在0.5(中间) 最优响应=0.5 (扎堆)');

console.log('\n=== socialOptimum ===');
assertArrClose(socialOptimum(2), [0.25, 0.75], 1e-9, '2家社会最优=[0.25,0.75]');
assertArrClose(socialOptimum(3), [1 / 6, 0.5, 5 / 6], 1e-9, '3家社会最优=[1/6,1/2,5/6]');
assertArrClose(socialOptimum(4), [0.125, 0.375, 0.625, 0.875], 1e-9, '4家社会最优等距');
assert(socialOptimum(0).length === 0, '0家返回空数组');

console.log('\n=== nashEquilibrium2 ===');
assertArrClose(nashEquilibrium2(), [0.5, 0.5], 1e-9, '2家纳什均衡=[0.5,0.5]');

console.log('\n=== hasPureNashEquilibrium ===');
assert(hasPureNashEquilibrium(1) === true, '1家有纯均衡');
assert(hasPureNashEquilibrium(2) === true, '2家有纯均衡');
assert(hasPureNashEquilibrium(3) === false, '3家无纯均衡');
assert(hasPureNashEquilibrium(5) === false, '5家无纯均衡');

console.log('\n=== simulateConvergence ===');
// 2 家应收敛到 [0.5, 0.5]
var conv2 = simulateConvergence(2, 40, [0.1, 0.9], 0.6);
assert(conv2.converged === true, '2家从[0.1,0.9]出发 收敛');
assertArrClose(conv2.finalPositions, [0.5, 0.5], 0.02, '2家收敛到≈[0.5,0.5]');
assert(conv2.history.length === 41, 'history 长度=rounds+1');
// 可复现：同种子同结果
var cA = simulateConvergence(2, 20, undefined, 0.6);
var cB = simulateConvergence(2, 20, undefined, 0.6);
assertArrClose(cA.finalPositions, cB.finalPositions, 1e-9, '同种子可复现');
// 3 家无纯策略均衡：终点位置必存在可获利偏离（解析结论，与数值收敛标志无关）
var conv3 = simulateConvergence(3, 60, [0.2, 0.5, 0.8], 0.5);
var final3 = conv3.finalPositions;
var curShares3 = marketShares(final3);
var canDeviate3 = final3.some(function (p, i) {
  var br = bestResponse(final3, i);
  var trial = final3.slice();
  trial[i] = br;
  return marketShares(trial)[i] > curShares3[i] + 0.001;
});
assert(canDeviate3, '3家终点存在可获利偏离（无纯策略纳什均衡）');

console.log('\n=== compareStrategies ===');
var cmp2 = compareStrategies(2);
assertArrClose(cmp2.nash.positions, [0.5, 0.5], 1e-9, '2家纳什位置=[0.5,0.5]');
assertArrClose(cmp2.social.positions, [0.25, 0.75], 1e-9, '2家社会最优位置=[0.25,0.75]');
assertClose(cmp2.welfareLoss, 2.0, 0.05, '2家福利损失≈2倍');
assert(cmp2.hasPureEquilibrium === true, '2家有纯均衡');
// 3 家
var cmp3 = compareStrategies(3);
assert(cmp3.hasPureEquilibrium === false, '3家无纯均衡');
assertClose(cmp3.welfareLoss, 3.0, 0.1, '3家扎堆福利损失≈3倍');
// 社会最优的平均距离一定不大于纳什
assert(cmp3.social.avgDistance < cmp3.nash.avgDistance, '社会最优平均距离<纳什');

console.log('\n=== shareInequality ===');
var si = shareInequality([0.5, 0.5]);
assertClose(si.max, 0.5, 1e-9, '扎堆时最大份额0.5');
assertClose(si.min, 0.5, 1e-9, '扎堆时最小份额0.5');
var si3 = shareInequality([0, 0.5, 1]);
assertClose(si3.max, 0.5, 1e-9, '[0,0.5,1] 最大份额0.5(中店)');
assertClose(si3.min, 0.25, 1e-9, '[0,0.5,1] 最小份额0.25(边店)');

console.log('\n=== randomPositions ===');
var rp = randomPositions(4, 7);
assert(rp.length === 4, 'randomPositions(4) 返回4个');
assert(rp.every(function (v) { return v >= 0 && v <= 1; }), '所有位置在[0,1]');
var rp2 = randomPositions(4, 7);
assertArrClose(rp, rp2, 1e-9, '同种子复现');

console.log('\n——————————');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  console.error('⚠️ 存在失败用例');
  process.exit(1);
} else {
  console.log('🎉 全部通过');
}
