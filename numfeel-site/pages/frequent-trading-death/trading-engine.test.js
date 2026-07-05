// 频繁交易摩擦绞杀 - 测试套件
var eng = require('./trading-engine.js');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}
function assertClose(actual, expected, tol, msg) {
  tol = tol == null ? 1e-6 : tol;
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (got ' + actual.toFixed(4) + ', want ' + expected.toFixed(4) + ')'); passed++; }
  else { console.error('❌ ' + msg + ' (got ' + actual + ', want ' + expected + ')'); failed++; }
}

// 可注入的种子随机源（mulberry32，质量优于线性同余）
function seededRng(seed) {
  var a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('\n=== pureFeeErosion 基础测试 ===');
var e0 = eng.pureFeeErosion(100000, 0.0025, 0);
assert(e0.length === 1, '零次交易返回长度 1');
assertClose(e0[0], 100000, 1e-9, '零次交易无损耗 → [100000]');

var e1 = eng.pureFeeErosion(100000, 0.0025, 1);
assert(e1.length === 2, '1 次交易返回长度 2');
assertClose(e1[0], 100000, 1e-9, '初始值 = 本金');
assertClose(e1[1], 99750, 1e-9, '1 次交易后 = 100000 * 0.9975 = 99750');

var e244 = eng.pureFeeErosion(100000, 0.0025, 244);
assert(e244.length === 245, '244 次交易返回长度 245');
assertClose(e244[244], 54300, 100, '244 次交易后 ≈ 54300 (0.9975^244 * 100000)');

// 严格递减（费率 > 0）
var strictlyDec = true;
for (var i = 1; i < e244.length; i++) {
  if (e244[i] >= e244[i - 1]) { strictlyDec = false; break; }
}
assert(strictlyDec, '费率 > 0 时本金严格递减');

// 费率为 0 时持平
var eFlat = eng.pureFeeErosion(100000, 0, 10);
var allSame = eFlat.every(function(v) { return v === 100000; });
assert(allSame, '费率为 0 时全程持平');

console.log('\n=== simulateTrading 测试 ===');
var sim = eng.simulateTrading({
  principal: 100000, costPerTrade: 0.0025, winRate: 0.5,
  gainRate: 0.015, lossRate: 0.015, trades: 244
});
assert(sim.balances.length === 245, 'balances 长度 = trades + 1');
assert(sim.balances[0] === 100000, 'balances[0] = 本金');
assert(sim.totalFees > 0, '有交易就有费用 (totalFees > 0)');
assert(sim.wins + sim.losses === 244, 'wins + losses === trades');
assert(typeof sim.finalBalance === 'number' && isFinite(sim.finalBalance), 'finalBalance 为有限数字');

// 必赢（winRate=1）：扣费后仍为正，且 finalBalance > principal - totalFees
var simWin = eng.simulateTrading({
  principal: 100000, costPerTrade: 0.0025, winRate: 1.0,
  gainRate: 0.015, lossRate: 0.015, trades: 100
});
assert(simWin.wins === 100 && simWin.losses === 0, 'winRate=1 时全部计为 wins');
assert(simWin.finalBalance > 100000 - simWin.totalFees, '必赢时 finalBalance > principal - totalFees');

// 必输（winRate=0）：finalBalance < principal
var simLose = eng.simulateTrading({
  principal: 100000, costPerTrade: 0.0025, winRate: 0.0,
  gainRate: 0.015, lossRate: 0.015, trades: 100
});
assert(simLose.wins === 0 && simLose.losses === 100, 'winRate=0 时全部计为 losses');
assert(simLose.finalBalance < 100000, '必输时 finalBalance < principal');

// 注入 rng 可复现
var r1 = eng.simulateTrading({ principal: 100000, costPerTrade: 0.0025, winRate: 0.5, gainRate: 0.02, lossRate: 0.02, trades: 50, rng: seededRng(42) });
var r2 = eng.simulateTrading({ principal: 100000, costPerTrade: 0.0025, winRate: 0.5, gainRate: 0.02, lossRate: 0.02, trades: 50, rng: seededRng(42) });
assertClose(r1.finalBalance, r2.finalBalance, 1e-9, '同种子 rng 产生可复现结果');

console.log('\n=== breakEvenWinRate 测试（几何精确公式） ===');
assertClose(eng.breakEvenWinRate(0.0025, 0.015, 0.015), 0.5872, 0.01, '(0.25%, 1.5%, 1.5%) → ≈ 58.7%');
assertClose(eng.breakEvenWinRate(0, 0.015, 0.015), 0.5038, 0.005, '无手续费时对称盈亏 → ≈ 50.4%（对数不对称）');
var bew = eng.breakEvenWinRate(0.0025, 0.015, 0.015);
assert(bew > 0 && bew < 1, '返回值在 (0, 1) 范围内');
// 成本越高，打平胜率越高
var bew2 = eng.breakEvenWinRate(0.005, 0.015, 0.015);
assert(bew2 > bew, '成本更高 → 打平胜率更高');

console.log('\n=== annualFeeConsumption 测试 ===');
assertClose(eng.annualFeeConsumption(0.0025, 244), 0.457, 0.01, '(0.25%, 244 次) → ≈ 0.457');
assertClose(eng.annualFeeConsumption(0.0025, 0), 0, 1e-9, '零交易 → 0');
assertClose(eng.annualFeeConsumption(0, 244), 0, 1e-9, '零费率 → 0');
var afc = eng.annualFeeConsumption(0.0025, 244);
assert(afc >= 0 && afc < 1, '返回值在 [0, 1) 范围内');
// 频率越高消耗越大
assert(eng.annualFeeConsumption(0.0025, 732) > afc, '频率更高 → 年化消耗更大');

console.log('\n=== breakEvenAnnualReturn 测试 ===');
// 0.25% 成本、244 次 → 需要 (1/0.9975^244 - 1) ≈ 84.1% 年化才能打平
assertClose(eng.breakEvenAnnualReturn(0.0025, 244), 0.841, 0.02, '(0.25%, 244 次) → ≈ 84.1%');
assertClose(eng.breakEvenAnnualReturn(0, 244), 0, 1e-9, '零费率 → 0');
assertClose(eng.breakEvenAnnualReturn(0.0025, 0), 0, 1e-9, '零交易 → 0');
assert(eng.breakEvenAnnualReturn(0.003, 732) > eng.breakEvenAnnualReturn(0.0025, 244), '更高频率/成本 → 打平年化更高');

console.log('\n=== monteCarloSimulation 统计测试 ===');
// 无费用、胜率 50%、对称盈亏 → 算术均值 ≈ 本金
var mc1 = eng.monteCarloSimulation({
  principal: 100000, costPerTrade: 0, winRate: 0.5,
  gainRate: 0.015, lossRate: 0.015, trades: 244,
  rng: seededRng(2024)
}, 1000);
assertClose(mc1.mean, 100000, 5000, '无费用时 mean ≈ principal (±5%)');

// 有费用、胜率 50% → 均值 < 本金
var mc2 = eng.monteCarloSimulation({
  principal: 100000, costPerTrade: 0.0025, winRate: 0.5,
  gainRate: 0.015, lossRate: 0.015, trades: 244,
  rng: seededRng(2025)
}, 1000);
assert(mc2.mean < 100000, '有费用时 mean < principal');
assert(mc2.results.length === 1000, 'results 长度 = runs');
assert(mc2.percentile5 < mc2.median && mc2.median < mc2.percentile95, 'percentile5 < median < percentile95');
assert(mc2.ruinRate >= 0 && mc2.ruinRate <= 1, 'ruinRate 在 [0,1]');

// 频率更高 → 中位数更低（摩擦更狠）
var mc3 = eng.monteCarloSimulation({
  principal: 100000, costPerTrade: 0.0025, winRate: 0.5,
  gainRate: 0.015, lossRate: 0.015, trades: 732,
  rng: seededRng(2026)
}, 1000);
assert(mc3.median < mc2.median, '更高频率 → median 更低');

console.log('\n=========================');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
console.log('=========================');
if (failed > 0) process.exit(1);
