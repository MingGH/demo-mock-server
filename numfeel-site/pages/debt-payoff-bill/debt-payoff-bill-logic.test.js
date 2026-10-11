/**
 * debt-payoff-bill-logic.test.js — node 直跑：node pages/debt-payoff-bill/debt-payoff-bill-logic.test.js
 * 全部断言通过时 exit 0。
 */
'use strict';

const L = require('./debt-payoff-bill-logic.js');

let failed = 0;
function ok(cond, msg) {
  if (cond) {
    console.log('  ok - ' + msg);
  } else {
    failed += 1;
    console.error('  FAIL - ' + msg);
  }
}
function near(a, b, eps, msg) {
  ok(Math.abs(a - b) <= eps, msg + '（got ' + a + ', want ' + b + '）');
}
function throws(fn, msg) {
  try {
    fn();
    failed += 1;
    console.error('  FAIL - 应当抛异常：' + msg);
  } catch (e) {
    ok(true, '抛异常 - ' + msg + '（' + e.message + '）');
  }
}

console.log('monthlyPayment 基本公式');
{
  near(L.monthlyPayment(0, 24, 12), 0, 1e-9, '本金 0 时月供为 0');
  near(L.monthlyPayment(120000, 0, 24), 5000, 1e-9, '0% 利率时月供 = 本金/期数');

  // 已知值反推：12 万、年化 24%、12 期。用闭式解独立计算。
  const r = 0.24 / 12;
  const expect = 120000 * r / (1 - Math.pow(1 + r, -12));
  near(L.monthlyPayment(120000, 24, 12), expect, 1e-6, '24% / 12 期与闭式解一致');

  // 摊销表验证：按返回的月供逐月扣减，期末余额应为 0（独立于公式的验证路径）。
  const m = L.monthlyPayment(300000, 23.9, 24);
  let balance = 300000;
  for (let i = 0; i < 24; i += 1) {
    balance = balance * (1 + 0.239 / 12) - m;
  }
  near(balance, 0, 1e-6, '23.9% / 24 期摊销 24 个月后余额归零');

  // 单调性：利率越高月供越高；期数越长月供越低。
  ok(L.monthlyPayment(100000, 10, 12) < L.monthlyPayment(100000, 24, 12), '利率升 → 月供升');
  ok(L.monthlyPayment(100000, 24, 12) > L.monthlyPayment(100000, 24, 24), '期数升 → 月供降');

  throws(function () { L.monthlyPayment(1000, 10, 0); }, '期数 0 非法');
  throws(function () { L.monthlyPayment(1000, 10, 1.5); }, '期数小数非法');
  throws(function () { L.monthlyPayment(-1, 10, 12); }, '负本金非法');
  throws(function () { L.monthlyPayment(1000, -2, 12); }, '负利率非法');
  throws(function () { L.monthlyPayment(NaN, 10, 12); }, 'NaN 本金非法');
}

console.log('loanRow / loanSummary 汇总一致性');
{
  const loans = [
    { name: '平台A', amount: 120000, rate: 23.9 },
    { name: '平台B', amount: 100000, rate: 18 },
    { name: '平台C', amount: 80000, rate: 35.9 },
  ];
  const s = L.loanSummary(loans, 24);
  near(s.totalPrincipal, 300000, 1e-9, '合计本金');
  near(s.totalMonthly, s.rows.reduce(function (acc, x) { return acc + x.monthly; }, 0), 1e-9, '总月供 = 各行月供之和');
  near(s.totalInterest, s.totalMonthly * 24 - 300000, 1e-9, '总利息 = 总月供×期数 - 本金');

  // 加权综合年化：(120000×23.9 + 100000×18 + 80000×35.9) / 300000 = 25.1333…
  near(s.weightedRate, 7540000 / 300000, 1e-9, '按本金加权的综合年化');

  // 每行利息为正（利率 > 0 时）。
  ok(s.rows.every(function (x) { return x.interest > 0; }), '有息债务每行利息为正');

  // 空清单：总额为 0，加权利率为 0，不抛异常。
  const empty = L.loanSummary([], 12);
  near(empty.totalMonthly, 0, 1e-9, '空清单总月供为 0');
  near(empty.weightedRate, 0, 1e-9, '空清单加权利率为 0');

  // 缺省名称兜底。
  const unnamed = L.loanRow({ amount: 1000, rate: 0 }, 12);
  ok(unnamed.name === '未命名', '缺省名称兜底为「未命名」');

  throws(function () { L.loanSummary(loans, 0); }, '汇总期数 0 非法');
  throws(function () { L.loanSummary('x', 12); }, '汇总入参非数组非法');
  throws(function () { L.loanRow(null, 12); }, '单行入参 null 非法');
}

console.log('affordability 判定档位');
{
  const salary = 5000;
  near(L.affordability(6000, salary).ratioPct, 120, 1e-9, '比率计算 120%');
  ok(L.affordability(6000, salary).level === 'impossible', '120% → impossible（月供超过全部收入）');
  ok(L.affordability(5000, salary).level === 'critical', '恰好 100% → critical（边界不判 impossible）');
  ok(L.affordability(4000, salary).level === 'critical', '80% → critical');
  ok(L.affordability(2600, salary).level === 'hard', '52% → hard');
  ok(L.affordability(1600, salary).level === 'tight', '32% → tight');
  ok(L.affordability(1000, salary).level === 'ok', '20% → ok');
  ok(L.affordability(0, salary).level === 'ok', '0 月供 → ok');
  ok(L.affordability(1000, 0).level === 'unknown', '月薪 0 → unknown');
  ok(L.affordability(1000, NaN).level === 'unknown', '月薪 NaN → unknown');
  near(L.affordability(4000, 5000).remaining, 1000, 1e-9, '剩余 = 月薪 - 月供');
}

console.log('bankComparison 银行对照');
{
  const c1 = L.bankComparison(300000, 24);
  ok(c1.months === 60, '网贷 24 期时对照期数抬到 60 期');
  near(c1.monthly, L.monthlyPayment(300000, 4, 60), 1e-9, '对照月供 = 4% / 60 期等额本息');
  const c2 = L.bankComparison(300000, 120);
  ok(c2.months === 120, '网贷期数超过 60 时按网贷期数对照');

  // 直觉验证：4% / 60 期月供应明显低于 24% / 24 期。
  const web = L.monthlyPayment(300000, 24, 24);
  ok(c1.monthly < web * 0.5, '银行对照月供不足网贷月供的一半');
}

if (failed > 0) {
  console.error('\n' + failed + ' 个断言失败');
  process.exit(1);
}
console.log('\n全部通过');
process.exit(0);
