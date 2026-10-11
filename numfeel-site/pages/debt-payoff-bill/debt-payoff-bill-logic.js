/**
 * debt-payoff-bill-logic.js — 网贷上岸清单：纯计算逻辑（无 DOM）
 *
 * 全部函数为纯函数，可在浏览器与 Node 中直接运行。
 * 单位约定：金额一律为元，利率一律为「年化百分比数值」（24 表示 24%）。
 */

'use strict';

/**
 * 校验期数：必须是 >= 1 的有限整数。
 * @param {*} months 期数
 * @throws {Error} 非法期数
 */
function assertMonths(months) {
  if (!Number.isFinite(months) || !Number.isInteger(months) || months < 1) {
    throw new Error('期数必须是不小于 1 的整数，收到：' + months);
  }
}

/**
 * 等额本息每月还款额。
 * 公式：M = P * r / (1 - (1 + r)^-n)，r 为月利率。
 * @param {number} principal 本金（元），>= 0
 * @param {number} annualRatePct 年化利率（百分数，24 表示 24%），>= 0
 * @param {number} months 期数（月），>= 1 整数
 * @returns {number} 每月还款额（元）
 * @throws {Error} 参数非法
 */
function monthlyPayment(principal, annualRatePct, months) {
  assertMonths(months);
  if (!Number.isFinite(principal) || principal < 0) {
    throw new Error('本金必须是非负数，收到：' + principal);
  }
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new Error('年化利率必须是非负数，收到：' + annualRatePct);
  }
  if (principal === 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return principal * r / (1 - Math.pow(1 + r, -months));
}

/**
 * 单笔债务的等额本息明细。
 * @param {{name?: string, amount: number, rate: number}} loan 一笔债务
 * @param {number} months 期数（月）
 * @returns {{name: string, amount: number, rate: number, monthly: number, interest: number}}
 * @throws {Error} 参数非法
 */
function loanRow(loan, months) {
  assertMonths(months);
  if (!loan || typeof loan !== 'object') {
    throw new Error('loan 必须是对象');
  }
  const amount = Number(loan.amount);
  const rate = Number(loan.rate);
  const monthly = monthlyPayment(amount, rate, months);
  return {
    name: String(loan.name || '').trim() || '未命名',
    amount: amount,
    rate: rate,
    monthly: monthly,
    interest: monthly * months - amount,
  };
}

/**
 * 多笔债务汇总（期限统一）。
 * @param {Array<{name?: string, amount: number, rate: number}>} loans 债务清单
 * @param {number} months 期数（月）
 * @returns {{rows: Array, totalPrincipal: number, totalMonthly: number,
 *            totalInterest: number, weightedRate: number}}
 *   weightedRate 为按本金加权的综合年化（百分数）。
 * @throws {Error} 参数非法
 */
function loanSummary(loans, months) {
  assertMonths(months);
  if (!Array.isArray(loans)) {
    throw new Error('loans 必须是数组');
  }
  const rows = loans.map(function (l) { return loanRow(l, months); });
  let totalPrincipal = 0;
  let totalMonthly = 0;
  let weighted = 0;
  for (const row of rows) {
    totalPrincipal += row.amount;
    totalMonthly += row.monthly;
    weighted += row.amount * row.rate;
  }
  return {
    rows: rows,
    totalPrincipal: totalPrincipal,
    totalMonthly: totalMonthly,
    totalInterest: totalMonthly * months - totalPrincipal,
    weightedRate: totalPrincipal > 0 ? weighted / totalPrincipal : 0,
  };
}

/**
 * 月供承受力判定。
 * 阈值（月供 / 税后月薪）：>100% 无解；>70% 危险；>50% 压垮；>30% 吃力；其余 可行。
 * @param {number} totalMonthly 每月需还（元）
 * @param {number} salary 税后月薪（元）
 * @returns {{ratioPct: number, remaining: number, level: ('impossible'|'critical'|'hard'|'tight'|'ok'|'unknown')}}
 */
function affordability(totalMonthly, salary) {
  if (!Number.isFinite(salary) || salary <= 0) {
    return { ratioPct: 0, remaining: 0, level: 'unknown' };
  }
  const ratioPct = totalMonthly / salary * 100;
  let level = 'ok';
  if (ratioPct > 100) level = 'impossible';
  else if (ratioPct > 70) level = 'critical';
  else if (ratioPct > 50) level = 'hard';
  else if (ratioPct > 30) level = 'tight';
  return {
    ratioPct: ratioPct,
    remaining: salary - totalMonthly,
    level: level,
  };
}

/**
 * 银行信用贷对照：同样本金，按年化 4%、期限至少 60 期的等额本息月供。
 * 用途：展示「同一笔钱换个借法」的月供差距。
 * @param {number} principal 本金（元）
 * @param {number} months 网贷侧期数（月），对照期数取 max(months, 60)
 * @returns {{rate: number, months: number, monthly: number}}
 */
function bankComparison(principal, months) {
  const bankMonths = Math.max(Number(months) || 0, 60);
  return {
    rate: 4,
    months: bankMonths,
    monthly: monthlyPayment(principal, 4, bankMonths),
  };
}

const DebtBillLogic = {
  monthlyPayment: monthlyPayment,
  loanRow: loanRow,
  loanSummary: loanSummary,
  affordability: affordability,
  bankComparison: bankComparison,
};

if (typeof window !== 'undefined') {
  window.DebtBillLogic = DebtBillLogic;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DebtBillLogic;
}
