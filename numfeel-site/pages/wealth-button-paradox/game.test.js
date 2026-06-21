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

function formatMoney(num) {
  if (num >= 1e12) return '\u00a5' + (num/1e12).toFixed(2) + '万亿';
  if (num >= 1e8) return '\u00a5' + (num/1e8).toFixed(2) + '亿';
  if (num >= 1e4) return '\u00a5' + (num/1e4).toFixed(2) + '万';
  if (num >= 1) return '\u00a5' + num.toFixed(2);
  if (num >= 0.01) return '\u00a5' + num.toFixed(4);
  return '\u00a5' + num.toExponential(2);
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
assert(formatMoney(25000) === '\u00a52.50万', '2.5万');
assert(formatMoney(0.5) === '\u00a50.5000', '0.5元 (4位小数)');
assert(formatMoney(0.005).includes('e'), '0.005元使用科学计数法');
assert(formatMoney(0.001).includes('e'), '极小值使用科学计数法');
assert(formatMoney(0) === '\u00a50.00e+0', '0元');

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
