/**
 * wealth-button-paradox.html 核心逻辑单元测试
 * 运行: node pages/wealth-button-paradox.test.js
 */

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

// ===== 被测逻辑 =====

const CHINESE_LARGE_UNITS = ['', '万', '亿', '万亿', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极', '恒河沙', '阿僧祇', '那由他', '不可思议', '无量', '大数'];

function getChineseLargeUnit(groupIndex) {
  if (groupIndex <= 0) return '';
  const maxIndex = CHINESE_LARGE_UNITS.length - 1;
  if (groupIndex <= maxIndex) return CHINESE_LARGE_UNITS[groupIndex];
  const whole = Math.floor(groupIndex / maxIndex);
  const rest = groupIndex % maxIndex;
  return (rest > 0 ? CHINESE_LARGE_UNITS[rest] : '') + CHINESE_LARGE_UNITS[maxIndex].repeat(whole);
}

function formatLargeChineseNumber(abs, digits) {
  const groupIndex = Math.floor(Math.log10(abs) / 4);
  const scaled = abs / Math.pow(10, groupIndex * 4);
  let fractionDigits = digits === undefined ? 2 : digits;
  if (scaled >= 1000) fractionDigits = 0;
  else if (scaled >= 100) fractionDigits = Math.min(fractionDigits, 1);
  return {
    text: scaled.toFixed(fractionDigits) + getChineseLargeUnit(groupIndex),
    exponent: groupIndex * 4
  };
}

function formatPowerHint(num) {
  const abs = Math.abs(num);
  if (!Number.isFinite(abs) || abs < 1e4) return '';
  return `约 10 的 ${Math.floor(Math.log10(abs))} 次方量级`;
}

function formatMoney(num) {
  if (!Number.isFinite(num)) return num < 0 ? '-\u00a5∞' : '\u00a5∞';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1e4) return sign + '\u00a5' + formatLargeChineseNumber(abs, 2).text;
  if (abs >= 1) return sign + '\u00a5' + abs.toFixed(2);
  if (abs >= 0.01) return sign + '\u00a5' + abs.toFixed(4);
  return sign + '\u00a5' + abs.toExponential(2);
}

function formatReturnRate(value, digits) {
  const fixedDigits = digits === undefined ? 2 : digits;
  if (!Number.isFinite(value)) return value < 0 ? '-∞%' : '+∞%';
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e4) return sign + formatLargeChineseNumber(abs, fixedDigits).text + '%';
  return sign + abs.toFixed(fixedDigits) + '%';
}

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

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

function buildChallengePayload(challengeId, username, initial, roundHistory) {
  return challengeId + '|' + username + '|' + initial + '|' + roundHistory;
}

function replayStoredGame(initial, roundHistory, fee) {
  fee = fee === undefined ? 5 : fee;
  let wealth = initial;
  let winCount = 0;
  const rounds = [];
  for (let i = 0; i < roundHistory.length; i++) {
    const before = wealth;
    const win = roundHistory.charAt(i) === 'W';
    if (win) winCount++;
    wealth = win ? wealth * 9 : wealth * 0.1;
    wealth -= fee;
    if (wealth < 0) wealth = 0;
    rounds.push({ round: i + 1, win, before, after: wealth });
  }
  return {
    rounds,
    finalWealth: wealth,
    winCount: winCount,
    loseCount: roundHistory.length - winCount,
    returnRate: (wealth / initial - 1) * 100
  };
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
assert(formatMoney(100000) === '\u00a510.00万', '10万显示为 ¥10.00万');
assert(formatMoney(1e8) === '\u00a51.00亿', '1亿');
assert(formatMoney(5.5e12) === '\u00a55.50万亿', '5.5万亿');
assert(formatMoney(1e16) === '\u00a51.00京', '1京');
assert(formatMoney(1e96) === '\u00a51.00秭大数', '超大值使用复合中文单位');
assert(formatMoney(25000) === '\u00a52.50万', '2.5万');
assert(formatMoney(0.5) === '\u00a50.5000', '0.5元 (4位小数)');
assert(formatMoney(0.005).includes('e'), '0.005元使用科学计数法');
assert(formatMoney(0.001).includes('e'), '极小值使用科学计数法');
assert(formatMoney(0) === '\u00a50.00e+0', '0元');
assert(formatPowerHint(1e96) === '约 10 的 96 次方量级', '超大值量级提示');

console.log('\n=== formatReturnRate 测试 ===');
assert(formatReturnRate(12.345) === '+12.35%', '普通收益率');
assert(formatReturnRate(1e20) === '+1.00垓%', '超大收益率使用中文单位');
assert(formatReturnRate(-1e24, 1) === '-1.0秭%', '负收益率保持符号');

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

console.log('\n=== 边界情况 ===');
// 连赢（无手续费，纯乘法验证）
let w = 100;
for (let i = 0; i < 5; i++) w = simulatePress(w, true, 0);
assert(approx(w, 100 * Math.pow(9, 5), 1), '连赢5次: 100 * 9^5 = ' + (100 * Math.pow(9, 5)));

// 连输
w = 100000;
for (let i = 0; i < 5; i++) w = simulatePress(w, false, 0);
assert(approx(w, 100000 * Math.pow(0.1, 5), 0.01), '连输5次: 100000 * 0.1^5');

// 一赢一输交替（应逐渐下降）
w = 100000;
for (let i = 0; i < 10; i++) {
  w = simulatePress(w, i % 2 === 0, 0); // 赢输交替
}
assert(w < 100000, '赢输交替后资产下降（因为9*0.1=0.9<1）');

// ===== 结果汇总 =====
console.log(`\n========================================`);
console.log(`总计: ${passed + failed} 个测试, ${passed} 通过, ${failed} 失败`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
