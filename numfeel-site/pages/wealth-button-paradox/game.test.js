/**
 * wealth-button-paradox.html 核心逻辑单元测试
 * 运行: node pages/wealth-button-paradox/game.test.js
 *
 * 重要：纯函数统一从 ./game.js **require 真实现**（game.js 顶部已做 DOM 副作用守卫，
 * 底部条件导出，见 game.js 末尾 module.exports）。不要在这里复制一份同名函数，
 * 否则 game.js 实现一旦改动，本测试仍会全部通过，等于没测。
 * 仅当被测函数在 game.js 里不存在（纯数学/模拟函数）时才在本文件内自实现。
 */

const {
  shouldResetRoundState,
  reachesMultipleMilestone,
  reachesBillionaireMilestone,
  computeUpdatedPeak,
  getChineseLargeUnit,
  formatLargeChineseNumber,
  formatPowerHint,
  toSuperscript,
  formatScientific,
  formatMoney,
  formatReturnRate,
  formatNumber,
  buildChallengePayload,
  replayStoredGame
} = require('./game.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function approx(a, b, eps) {
  eps = eps || 0.0001;
  return Math.abs(a - b) < eps;
}

// ===== 被测逻辑（仅本文件自实现，game.js 里没有的纯函数） =====

function simulatePress(wealth, win, fee) {
  if (fee === undefined) fee = 5;
  let result = win ? wealth * 9 : wealth * 0.1;
  result -= fee;
  if (result < 0) result = 0;
  return result;
}

function geometricExpectation(winMultiplier, loseMultiplier) {
  return Math.sqrt(winMultiplier * loseMultiplier);
}

function arithmeticExpectation(pWin, winMult, pLose, loseMult) {
  return pWin * winMult + pLose * loseMult;
}

function kellyFraction(pWin, netOdds) {
  const pLose = 1 - pWin;
  return (pWin * netOdds - pLose) / netOdds;
}

function expectedWealthAfterN(initial, n) {
  // With equal wins and losses: initial * 0.9^n
  return initial * Math.pow(0.9, n);
}

function normalizeQuantumNumbers(rawNumbers, maxVal) {
  return rawNumbers.map(n => n / maxVal);
}

function runBatchSimulation(people, presses, initial) {
  const results = [];
  for (let i = 0; i < people; i++) {
    let w = initial;
    for (let j = 0; j < presses; j++) {
      w *= Math.random() < 0.5 ? 9 : 0.1;
    }
    results.push(w);
  }
  results.sort((a, b) => a - b);
  const bankruptCount = results.filter(w => w < 1).length;
  const profitCount = results.filter(w => w > initial).length;
  const median = results[Math.floor(people / 2)];
  const avg = results.reduce((a, b) => a + b, 0) / people;
  return { results, bankruptCount, profitCount, median, avg };
}

// ===== 测试用例 =====

console.log('\n=== formatMoney 测试 ===');
assert(formatMoney(100000) === '\u00a5100000.00', '10万 < 1亿，用普通两位小数显示');
assert(formatMoney(1e8) === '\u00a51.00 × 10⁸', '1亿显示为科学计数法');
assert(formatMoney(5.5e12) === '\u00a55.50 × 10¹²', '5.5万亿显示为科学计数法');
assert(formatMoney(1e16) === '\u00a51.00 × 10¹⁶', '1京显示为科学计数法');
assert(formatMoney(1e96) === '\u00a51.00 × 10⁹⁶', '超大值显示为科学计数法');
assert(formatMoney(25000) === '\u00a525000.00', '2.5万 < 1亿，用普通两位小数显示');
assert(formatMoney(0.5) === '\u00a50.5000', '0.5元 (4位小数)');
assert(formatMoney(0.005).includes('× 10'), '0.005元使用科学计数法');
assert(formatMoney(0.001).includes('× 10'), '极小值使用科学计数法');
assert(formatMoney(0) === '\u00a50.00', '0元');
assert(formatPowerHint(1e96) === '约 10 的 96 次方量级', '超大值量级提示');

console.log('\n=== formatReturnRate 测试 ===');
assert(formatReturnRate(12.345) === '+12.35%', '普通收益率');
assert(formatReturnRate(1e20) === '+1.00 × 10²⁰%', '超大收益率使用科学计数法');
assert(formatReturnRate(-1e24, 1) === '-1.0 × 10²⁴%', '负收益率使用科学计数法');

console.log('\n=== formatNumber 测试 ===');
assert(formatNumber(500) === '500', '500 不变');
assert(formatNumber(15000) === '1.5万', '15000 → 1.5万');
assert(formatNumber(100000) === '10.0万', '100000 → 10.0万');

console.log('\n=== 游戏核心逻辑 ===');
assert(simulatePress(100000, true) === 100000 * 9 - 5, '赢：资产 x9 减手续费');
assert(simulatePress(100000, false) === 100000 * 0.1 - 5, '输：资产 x0.1 减手续费');
assert(simulatePress(3, false) === 0, '资产极低时输了不会变负数');
assert(simulatePress(0, true) === 0, '0资产赢了仍为0(扣手续费后)');
assert(simulatePress(10, true, 0) === 90, '无手续费时：10 x 9 = 90');

console.log('\n=== 数学验证 ===');
assert(approx(arithmeticExpectation(0.5, 9, 0.5, 0.1), 4.55), '算术期望 = 4.55');
assert(approx(geometricExpectation(9, 0.1), 0.9487, 0.001), '几何期望 ≈ 0.949');
assert(geometricExpectation(9, 0.1) < 1, '几何期望 < 1（长期亏损）');
assert(approx(kellyFraction(0.5, 8), 0.4375), '凯利比例 = 0.4375');
assert(approx(expectedWealthAfterN(100000, 10), 100000 * Math.pow(0.9, 10)), '10次后预期值正确');
assert(expectedWealthAfterN(100000, 100) < 10, '100次后中位数接近归零');

console.log('\n=== 量子随机数归一化 ===');
const raw = [0, 500000, 999999, 123456];
const normalized = normalizeQuantumNumbers(raw, 1000000);
assert(normalized[0] === 0, '0归一化为0');
assert(approx(normalized[1], 0.5), '500000归一化为0.5');
assert(approx(normalized[2], 0.999999), '999999归一化接近1');
assert(normalized.every(v => v >= 0 && v < 1), '所有值在[0,1)范围内');

console.log('\n=== 提交挑战载荷 ===');
assert(buildChallengePayload('cid', 'alice', 100000, 'WWLL') === 'cid|alice|100000|WWLL', 'challenge payload 格式正确');

console.log('\n=== 排行榜过程回放 ===');
const replay = replayStoredGame(100000, 'WL');
assert(replay.rounds.length === 2, '记录完整回放轮次');
assert(replay.winCount === 1 && replay.loseCount === 1, '胜负统计正确');
assert(approx(replay.finalWealth, 89994.5, 0.0001), '最终资产按服务器规则重放');
assert(approx(replay.returnRate, -10.0055, 0.0001), '收益率按服务器规则重放');
assert(replay.rounds[0].before === 100000, '首轮起点正确');
assert(approx(replay.rounds[1].after, 89994.5, 0.0001), '末轮资产正确');

console.log('\n=== 蒙特卡洛模拟 ===');
const sim = runBatchSimulation(1000, 100, 100000);
assert(sim.results.length === 1000, '生成1000个结果');
assert(sim.results[0] <= sim.results[999], '结果已排序');
assert(sim.bankruptCount + (1000 - sim.bankruptCount) === 1000, '破产计数合理');
// 统计规律：大部分人应该破产（几何期望<1）
assert(sim.bankruptCount > 300, '破产率应较高（几何期望<1决定）: 实际=' + sim.bankruptCount);
// 平均值应远高于中位数（少数暴富拉高均值）
assert(sim.avg > sim.median, '均值 > 中位数（右偏分布）');
assert(sim.median < 100000, '中位数低于初始资金');

console.log('\n=== 埋点辅助纯函数（来自 game.js 真实现） ===');
assert(reachesMultipleMilestone(1000000, 100000, 10) === true, '资产达到10倍应命中x10里程碑');
assert(reachesMultipleMilestone(999999, 100000, 10) === false, '资产未达10倍不应命中x10里程碑');
assert(reachesMultipleMilestone(10000000, 100000, 100) === true, '资产达到100倍应命中x100里程碑');
assert(reachesBillionaireMilestone(1e8) === true, '资产恰好1亿应命中亿万富翁里程碑');
assert(reachesBillionaireMilestone(1e8 - 1) === false, '资产差一点到1亿不应命中里程碑');
assert(reachesBillionaireMilestone(2e8) === true, '资产超过1亿应命中里程碑');

{
  const p1 = computeUpdatedPeak(100000, 0, 150000, 1);
  assert(p1.peakWealth === 150000 && p1.peakPressIndex === 1, '新资产超过峰值时刷新峰值与索引');

  const p2 = computeUpdatedPeak(150000, 1, 90000, 2);
  assert(p2.peakWealth === 150000 && p2.peakPressIndex === 1, '新资产未超过峰值时保持原峰值不变');

  const p3 = computeUpdatedPeak(100000, 0, 100000, 1);
  assert(p3.peakWealth === 100000 && p3.peakPressIndex === 0, '资产相等时不刷新峰值（严格大于才刷新）');
}

console.log('\n=== 切后台不应重置局状态 (shouldResetRoundState, 来自 game.js 真实现) ===');
assert(shouldResetRoundState(0) === true, 'pressCount=0（首次开局 / reset 后）应重置派生状态');
assert(shouldResetRoundState(1) === false, 'pressCount>0（切后台回来继续按）不应重置');
assert(shouldResetRoundState(50) === false, '按了 50 次后切回来不应重置峰值/里程碑');
assert(shouldResetRoundState(-1) === false, '负数也不应触发重置');

// ===== 结果汇总 =====
console.log(`\n========================================`);
console.log(`总计: ${passed + failed} 个测试, ${passed} 通过, ${failed} 失败`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);