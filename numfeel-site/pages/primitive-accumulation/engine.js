/**
 * 原始资本积累模拟器 — 核心引擎
 *
 * 对比两个起点不同的人在 N 年里的净资产演化：
 *
 *  A. 底层（无启动资本）
 *     - 每月需要支付房租 = rentRatio × 工资
 *     - 必要生活支出 = livingRatio × 工资
 *     - 高息消费贷/网贷利息：未存够应急金时，遇到 shock 必须借钱
 *     - 偶发冲击（医疗/失业/家庭）：每月 shockProb/12 概率发生，金额 shockSize × 月薪
 *     - 剩余结余存入"低息储蓄"（年化 savingsRate，通常被通胀吃掉）
 *
 *  B. 有启动资本（有 C0 元启动资金）
 *     - 启动资本买入资产：不付房租（或租金收入），资产年化 assetRate
 *     - 同样的工资，结余可投入资产
 *     - 同样的 shock，但有储备金缓冲，不需借高息贷
 *
 * 所有金额单位：元；时间步长：1 个月。
 */

/**
 * 模拟一个人 N 年的净资产演化。
 * @param {Object} opts
 * @param {number} opts.salary         - 月薪
 * @param {number} opts.years          - 模拟年数
 * @param {number} opts.startCapital   - 启动资本（>0 表示有房 / 有资产）
 * @param {number} opts.rentRatio      - 房租占工资比例（启动资本者为 0）
 * @param {number} opts.livingRatio    - 必要生活支出占工资比例
 * @param {number} opts.savingsRate    - 储蓄年化收益（如 0.02）
 * @param {number} opts.assetRate      - 资产年化收益（如 0.06）
 * @param {number} opts.inflation      - 年通胀率（如 0.03）
 * @param {number} opts.shockProb      - 每年发生一次冲击的概率
 * @param {number} opts.shockSize      - 冲击规模（按当前月薪倍数计）
 * @param {number} opts.loanRate       - 借不到钱时网贷年化利率（如 0.36）
 * @param {number} opts.salaryGrowth   - 工资年增长率（如 0.03）
 * @param {Function} [opts.rand]       - 随机数函数（可注入用于测试 / 控制变量）
 * @returns {{
 *   netWorth: number[], debt: number[], savings: number[], asset: number[],
 *   monthlyCash: number[], totalRent: number, totalInterest: number,
 *   shocks: number, finalNetWorth: number
 * }}
 */
function simulatePerson(opts) {
  var salary        = opts.salary;
  var years         = opts.years;
  var startCapital  = opts.startCapital || 0;
  var rentRatio     = opts.rentRatio != null ? opts.rentRatio : 0.2;
  var livingRatio   = opts.livingRatio != null ? opts.livingRatio : 0.45;
  var savingsRate   = opts.savingsRate != null ? opts.savingsRate : 0.02;
  var assetRate     = opts.assetRate != null ? opts.assetRate : 0.06;
  var inflation     = opts.inflation != null ? opts.inflation : 0.03;
  var shockProb     = opts.shockProb != null ? opts.shockProb : 0.3;
  var shockSize     = opts.shockSize != null ? opts.shockSize : 6;
  var loanRate      = opts.loanRate != null ? opts.loanRate : 0.16;
  var salaryGrowth  = opts.salaryGrowth != null ? opts.salaryGrowth : 0.03;
  var rand          = opts.rand || Math.random;

  var months = years * 12;
  var asset = startCapital;
  var savings = 0;
  var debt = 0;

  var netWorth = [];
  var debtSeries = [];
  var savingsSeries = [];
  var assetSeries = [];
  var monthlyCash = [];

  var totalRent = 0;
  var totalInterest = 0;
  var shocks = 0;

  var monthlyAssetRate = Math.pow(1 + assetRate, 1/12) - 1;
  var monthlySavingsRate = Math.pow(1 + savingsRate, 1/12) - 1;
  var monthlyLoanRate = Math.pow(1 + loanRate, 1/12) - 1;
  var monthlyInflation = Math.pow(1 + inflation, 1/12) - 1;
  var monthlySalaryGrowth = Math.pow(1 + salaryGrowth, 1/12) - 1;
  var monthlyShockProb = shockProb / 12;

  var currentSalary = salary;

  for (var m = 0; m < months; m++) {
    currentSalary = currentSalary * (1 + monthlySalaryGrowth);
    asset = asset * (1 + monthlyAssetRate);
    savings = savings * (1 + monthlySavingsRate);

    var interestThisMonth = debt * monthlyLoanRate;
    debt += interestThisMonth;
    totalInterest += interestThisMonth;

    var rentThisMonth = currentSalary * rentRatio;
    totalRent += rentThisMonth;

    var livingThisMonth = currentSalary * livingRatio * (1 + monthlyInflation * m);

    var disposable = currentSalary - rentThisMonth - livingThisMonth;
    monthlyCash.push(disposable);

    if (rand() < monthlyShockProb) {
      shocks++;
      var shockAmount = currentSalary * shockSize;
      if (savings >= shockAmount) {
        savings -= shockAmount;
      } else {
        shockAmount -= savings;
        savings = 0;
        if (asset >= shockAmount * 1.1) {
          asset -= shockAmount * 1.1;
        } else {
          shockAmount -= asset / 1.1;
          asset = 0;
          debt += shockAmount;
        }
      }
    }

    if (disposable > 0) {
      if (debt > 0) {
        var pay = Math.min(disposable, debt);
        debt -= pay;
        disposable -= pay;
      }
      savings += disposable;
    } else {
      debt += -disposable;
    }

    var nw = asset + savings - debt;
    netWorth.push(nw);
    debtSeries.push(debt);
    savingsSeries.push(savings);
    assetSeries.push(asset);
  }

  return {
    netWorth: netWorth,
    debt: debtSeries,
    savings: savingsSeries,
    asset: assetSeries,
    monthlyCash: monthlyCash,
    totalRent: totalRent,
    totalInterest: totalInterest,
    shocks: shocks,
    finalNetWorth: netWorth[netWorth.length - 1]
  };
}

/**
 * 对比两个人：底层 vs 有启动资本者。
 * 两人面对相同的随机冲击序列（控制变量），区别只在于有没有 C0。
 * @param {Object} opts
 * @returns {{ poor: object, rich: object, gap: number, gapRatio: number }}
 */
function compareTwoLives(opts) {
  var seed = opts.seed != null ? opts.seed : 42;
  var rng = makeRng(seed);
  var randomSeq = [];
  for (var i = 0; i < opts.years * 12 + 10; i++) randomSeq.push(rng());

  var idxA = 0;
  var randA = function() { return randomSeq[idxA++]; };
  var idxB = 0;
  var randB = function() { return randomSeq[idxB++]; };

  var poorOpts = mergeOpts(opts, {
    startCapital: 0,
    rentRatio: opts.rentRatio != null ? opts.rentRatio : 0.2,
    rand: randA
  });
  var richOpts = mergeOpts(opts, {
    startCapital: opts.startCapital != null ? opts.startCapital : 1000000,
    rentRatio: 0,
    rand: randB
  });

  var poor = simulatePerson(poorOpts);
  var rich = simulatePerson(richOpts);

  var gap = rich.finalNetWorth - poor.finalNetWorth;
  var gapRatio = poor.finalNetWorth !== 0
    ? rich.finalNetWorth / poor.finalNetWorth
    : Infinity;

  return { poor: poor, rich: rich, gap: gap, gapRatio: gapRatio };
}

/**
 * Mulberry32 伪随机数发生器（可复现）。
 * @param {number} seed
 * @returns {Function}
 */
function makeRng(seed) {
  var s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mergeOpts(base, override) {
  var out = {};
  for (var k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
  for (var k2 in override) if (override.hasOwnProperty(k2)) out[k2] = override[k2];
  return out;
}

/**
 * 工具：月序列降采样为年序列（取每年最后一个月）。
 * @param {number[]} monthly
 * @returns {number[]}
 */
function toYearly(monthly) {
  var out = [];
  for (var i = 11; i < monthly.length; i += 12) out.push(monthly[i]);
  return out;
}

/**
 * 工具：格式化金额（万元）。
 * @param {number} v
 * @returns {string}
 */
function fmtWan(v) {
  if (!isFinite(v)) return '∞';
  var sign = v < 0 ? '-' : '';
  var abs = Math.abs(v);
  if (abs >= 10000) return sign + (abs / 10000).toFixed(1) + ' 万';
  return sign + Math.round(abs) + ' 元';
}

// Node 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulatePerson: simulatePerson,
    compareTwoLives: compareTwoLives,
    makeRng: makeRng,
    toYearly: toYearly,
    fmtWan: fmtWan
  };
}
