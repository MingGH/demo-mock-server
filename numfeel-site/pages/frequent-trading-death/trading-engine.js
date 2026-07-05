// ========== 频繁交易摩擦绞杀 - 核心算法（可独立测试） ==========
// 约定：
//   principal     初始本金
//   costPerTrade  单次双边交易成本率（佣金+印花税+滑点），如 0.0025 表示 0.25%
//   winRate       胜率 [0,1]
//   gainRate      单次盈利幅度（如 0.015 表示 +1.5%）
//   lossRate      单次亏损幅度（如 0.015 表示 -1.5%）
//   trades        总交易次数
//
// 单次交易模型（乘法侵蚀）：
//   赢：bal = bal * (1 + gainRate) * (1 - cost)
//   输：bal = bal * (1 - lossRate) * (1 - cost)
// 手续费以乘法形式作用于每次交易后的资金，长期呈现指数衰减。

/**
 * 计算纯手续费侵蚀（无策略收益）
 * @param {number} principal - 初始本金
 * @param {number} costPerTrade - 单次双边交易成本率 (如 0.0025)
 * @param {number} trades - 总交易次数
 * @returns {number[]} 每次交易后的本金数组，长度 = trades + 1
 */
function pureFeeErosion(principal, costPerTrade, trades) {
  var n = Math.max(0, Math.floor(trades));
  var out = new Array(n + 1);
  var bal = principal;
  out[0] = bal;
  var factor = 1 - costPerTrade;
  for (var i = 0; i < n; i++) {
    bal = bal * factor;
    out[i + 1] = bal;
  }
  return out;
}

/**
 * 模拟带策略收益的交易序列
 * @param {object} params
 * @param {number} params.principal - 初始本金
 * @param {number} params.costPerTrade - 单次双边成本率
 * @param {number} params.winRate - 胜率 (0~1)
 * @param {number} params.gainRate - 单次盈利幅度 (如 0.015)
 * @param {number} params.lossRate - 单次亏损幅度 (如 0.015)
 * @param {number} params.trades - 总交易次数
 * @param {function} [params.rng] - 可选随机源，默认 Math.random
 * @param {number[]} [params.uniforms] - 可选预生成均匀随机数 [0,1)，用于可复现/平滑对照
 * @returns {{balances: number[], totalFees: number, wins: number, losses: number, finalBalance: number}}
 */
function simulateTrading(params) {
  var principal = params.principal;
  var cost = params.costPerTrade;
  var winRate = params.winRate;
  var gainRate = params.gainRate;
  var lossRate = params.lossRate;
  var trades = Math.max(0, Math.floor(params.trades));
  var uniforms = params.uniforms;
  var rng = params.rng || Math.random;
  var costFactor = 1 - cost;

  var balances = new Array(trades + 1);
  var bal = principal;
  balances[0] = bal;
  var wins = 0, losses = 0, totalFees = 0;

  for (var i = 0; i < trades; i++) {
    var u = (uniforms && i < uniforms.length) ? uniforms[i] : rng();
    var isWin = u < winRate;
    var mid;
    if (isWin) {
      mid = bal * (1 + gainRate);
      wins++;
    } else {
      mid = bal * (1 - lossRate);
      losses++;
    }
    var fee = mid * cost;
    totalFees += fee;
    bal = mid * costFactor;
    balances[i + 1] = bal;
  }

  return {
    balances: balances,
    totalFees: totalFees,
    wins: wins,
    losses: losses,
    finalBalance: bal
  };
}

/**
 * 批量蒙特卡洛模拟（多次运行取统计值）
 * @param {object} params - 同 simulateTrading 的 params（不要传 uniforms，否则每次运行路径相同）
 * @param {number} runs - 模拟次数
 * @returns {{median: number, mean: number, percentile5: number, percentile95: number, ruinRate: number, results: number[]}}
 */
function monteCarloSimulation(params, runs) {
  runs = Math.max(1, Math.floor(runs));
  var principal = params.principal;
  var results = new Array(runs);
  for (var i = 0; i < runs; i++) {
    var r = simulateTrading(params);
    results[i] = r.finalBalance;
  }

  var sorted = results.slice().sort(function(a, b) { return a - b; });
  function pctile(p) {
    var idx = (p / 100) * (sorted.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  var mean = 0;
  for (var j = 0; j < results.length; j++) mean += results[j];
  mean /= results.length;

  // 破产定义：最终资金跌至初始本金的 10% 以下
  var ruinThreshold = principal * 0.1;
  var ruinCount = 0;
  for (var k = 0; k < results.length; k++) {
    if (results[k] < ruinThreshold) ruinCount++;
  }

  return {
    median: pctile(50),
    mean: mean,
    percentile5: pctile(5),
    percentile95: pctile(95),
    ruinRate: ruinCount / runs,
    results: results
  };
}

/**
 * 计算打平所需胜率（盈亏比 1:1 场景下覆盖手续费的最小胜率）
 * 推导：winRate*(gainRate - cost) = (1-winRate)*(lossRate + cost)
 *   → winRate = (lossRate + cost) / (gainRate + lossRate)
 * @param {number} costPerTrade - 单次双边成本率
 * @param {number} gainRate - 单次盈利幅度
 * @param {number} lossRate - 单次亏损幅度
 * @returns {number} 打平所需胜率
 */
function breakEvenWinRate(costPerTrade, gainRate, lossRate) {
  var denom = gainRate + lossRate;
  if (denom <= 0) return 0.5;
  return (lossRate + costPerTrade) / denom;
}

/**
 * 计算打平所需年化收益（策略收益需达到多少才能抵消手续费侵蚀）
 * 推导：(1 + r) * (1 - cost)^N = 1  →  r = (1 - cost)^(-N) - 1
 * @param {number} costPerTrade - 单次双边成本率
 * @param {number} tradesPerYear - 年交易次数
 * @returns {number} 需要的年化收益率才能覆盖手续费
 */
function breakEvenAnnualReturn(costPerTrade, tradesPerYear) {
  var n = Math.max(0, tradesPerYear);
  if (n === 0 || costPerTrade <= 0) return 0;
  return Math.pow(1 - costPerTrade, -n) - 1;
}

/**
 * 计算年化手续费消耗率
 * @param {number} costPerTrade - 单次双边成本率
 * @param {number} tradesPerYear - 年交易次数
 * @returns {number} 年化消耗百分比 (0~1)
 */
function annualFeeConsumption(costPerTrade, tradesPerYear) {
  var n = Math.max(0, tradesPerYear);
  if (n === 0 || costPerTrade <= 0) return 0;
  return 1 - Math.pow(1 - costPerTrade, n);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pureFeeErosion: pureFeeErosion,
    simulateTrading: simulateTrading,
    monteCarloSimulation: monteCarloSimulation,
    breakEvenWinRate: breakEvenWinRate,
    breakEvenAnnualReturn: breakEvenAnnualReturn,
    annualFeeConsumption: annualFeeConsumption
  };
}
