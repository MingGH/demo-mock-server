/**
 * engine.test.js
 * 用法：node pages/primitive-accumulation/engine.test.js
 */
var mod = require('./engine.js');
var simulatePerson = mod.simulatePerson;
var compareTwoLives = mod.compareTwoLives;
var makeRng = mod.makeRng;
var toYearly = mod.toYearly;
var fmtWan = mod.fmtWan;

var passed = 0, failed = 0;

function assert(desc, cond) {
  if (cond) { console.log('  ✓', desc); passed++; }
  else      { console.error('  ✗', desc); failed++; }
}

// ── makeRng（可复现性）──────────────────────────────────────
console.log('\n[makeRng]');
(function () {
  var r1 = makeRng(123), r2 = makeRng(123);
  var same = true;
  for (var i = 0; i < 50; i++) if (r1() !== r2()) { same = false; break; }
  assert('相同种子产生相同序列', same);

  var r3 = makeRng(124), r4 = makeRng(125);
  assert('不同种子产生不同序列', r3() !== r4());

  var r5 = makeRng(7);
  var allInRange = true;
  for (var j = 0; j < 100; j++) {
    var v = r5();
    if (v < 0 || v >= 1) { allInRange = false; break; }
  }
  assert('随机数在 [0,1) 范围内', allInRange);
})();

// ── simulatePerson 基础合理性 ─────────────────────────────
console.log('\n[simulatePerson]');
(function () {
  var noShockRng = function () { return 1.0; };
  var res = simulatePerson({
    salary: 8000, years: 10, startCapital: 0,
    rentRatio: 0.2, livingRatio: 0.45,
    savingsRate: 0.02, inflation: 0.03,
    shockProb: 0.3, shockSize: 6,
    loanRate: 0.16, salaryGrowth: 0.03,
    rand: noShockRng
  });
  assert('netWorth 长度 = 月数', res.netWorth.length === 120);
  assert('无冲击时不应发生 shock', res.shocks === 0);
  assert('无冲击时不应背负债务', res.debt[res.debt.length - 1] === 0);
  assert('无冲击 + 工资增长，月度现金流可为正', res.monthlyCash[0] > 0);
  assert('累计房租 > 0', res.totalRent > 0);
})();

// ── 启动资本带来净资产优势 ───────────────────────────────
console.log('\n[启动资本优势]');
(function () {
  var noShockRng = function () { return 1.0; };
  var poor = simulatePerson({
    salary: 8000, years: 10, startCapital: 0,
    rentRatio: 0.2, livingRatio: 0.45, rand: noShockRng
  });
  var rich = simulatePerson({
    salary: 8000, years: 10, startCapital: 1000000,
    rentRatio: 0, livingRatio: 0.45, rand: noShockRng
  });
  assert('有启动资本者最终净资产 > 底层', rich.finalNetWorth > poor.finalNetWorth);
  assert('启动资本者付出的房租为 0', rich.totalRent === 0);
  assert('底层付出了大量房租（>10万）', poor.totalRent > 100000);
})();

// ── 高息债务的滚雪球效应 ───────────────────────────────
console.log('\n[高息债务效应]');
(function () {
  var alwaysShockRng = function () { return 0.0; };
  var res = simulatePerson({
    salary: 5000, years: 10, startCapital: 0,
    rentRatio: 0.2, livingRatio: 0.45,
    shockProb: 0.3, shockSize: 6, loanRate: 0.16,
    rand: alwaysShockRng
  });
  assert('持续冲击下背上了高息债务', res.debt[res.debt.length - 1] > 0 || res.totalInterest > 0);
  assert('持续冲击下累计利息 > 0', res.totalInterest > 0);
  assert('最终净资产为负（被债务击穿）', res.finalNetWorth < 0);
})();

// ── compareTwoLives：可复现性 + 差距方向 ─────────────────
console.log('\n[compareTwoLives]');
(function () {
  var opts = {
    salary: 8000, years: 20,
    startCapital: 1000000,
    rentRatio: 0.2, livingRatio: 0.45,
    assetRate: 0.06, savingsRate: 0.02,
    shockProb: 0.3, shockSize: 6,
    loanRate: 0.16, salaryGrowth: 0.03,
    seed: 42
  };
  var a = compareTwoLives(opts);
  var b = compareTwoLives(opts);
  assert('相同种子产生相同结果（穷人最终）', a.poor.finalNetWorth === b.poor.finalNetWorth);
  assert('相同种子产生相同结果（富人最终）', a.rich.finalNetWorth === b.rich.finalNetWorth);
  assert('20年后差距 > 0', a.gap > 0);
  assert('20年后富人净资产 > 穷人', a.rich.finalNetWorth > a.poor.finalNetWorth);
})();

// ── 不同种子下趋势仍然成立 ────────────────────────────
console.log('\n[多次试验趋势]');
(function () {
  var richWins = 0, trials = 30;
  for (var s = 1; s <= trials; s++) {
    var r = compareTwoLives({
      salary: 8000, years: 20, startCapital: 1000000,
      rentRatio: 0.2, livingRatio: 0.45,
      shockProb: 0.3, shockSize: 6, loanRate: 0.16, seed: s
    });
    if (r.rich.finalNetWorth > r.poor.finalNetWorth) richWins++;
  }
  assert('30次试验中，有启动资本者全部胜出', richWins === trials);
})();

// ── 工具函数 ────────────────────────────────────────────
console.log('\n[toYearly]');
(function () {
  var monthly = [];
  for (var i = 0; i < 36; i++) monthly.push(i);
  var yearly = toYearly(monthly);
  assert('36个月降采样为3年', yearly.length === 3);
  assert('每年取最后一个月', yearly[0] === 11 && yearly[1] === 23 && yearly[2] === 35);
})();

console.log('\n[fmtWan]');
(function () {
  assert('5000 显示为元', fmtWan(5000) === '5000 元');
  assert('20000 显示为万', fmtWan(20000) === '2.0 万');
  assert('-30000 显示为负万', fmtWan(-30000) === '-3.0 万');
})();

// ── 边界条件 ────────────────────────────────────────────
console.log('\n[边界条件]');
(function () {
  var r = simulatePerson({ salary: 5000, years: 1, startCapital: 0, rand: function () { return 1; } });
  assert('1年模拟产生12个月数据', r.netWorth.length === 12);

  var r2 = simulatePerson({
    salary: 10000, years: 5, startCapital: 0,
    rentRatio: 0.3, livingRatio: 0.3,
    rand: function () { return 1; }
  });
  assert('高结余 + 无冲击下，5年后底层也能有正净资产', r2.finalNetWorth > 0);
})();

console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
