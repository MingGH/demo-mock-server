/**
 * engine.js - 当一次庄家：核心计算内核
 * 纯计算模块：不碰 DOM / Chart.js / GSAP，不读取任何页面状态。
 * 唯一与宿主环境的接触点是文件末尾的导出——浏览器挂 window.bhEngine，Node 走 module.exports。
 * 可被 Node.js 直接 require 测试
 */

/* ============================================================
 * 1. 可注入种子随机数生成器（mulberry32）
 * ============================================================ */

/**
 * mulberry32 种子随机数生成器
 * @param {number} seed - 整数种子
 * @returns {function} 返回 [0, 1) 浮点数的函数
 */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
 * 2. 庄家优势查表
 * ============================================================ */

/**
 * 各游戏的庄家优势
 * @param {string} game - 游戏标识
 * @returns {number} 庄家优势（0～1 之间的小数）
 */
function houseEdge(game) {
  var edges = {
    'european-roulette': 1 / 37,      // ≈ 0.02703
    'american-roulette': 2 / 38,      // ≈ 0.05263
    'baccarat-banker': 0.0106,
    'baccarat-player': 0.0124,
    'baccarat-tie': 0.144,
    'blackjack': 0.005,
    'slot-low': 0.05,
    'slot-mid': 0.10,
    'slot-high': 0.15
  };
  return edges[game] || 0;
}

/**
 * 返回全部游戏列表（含标签与计算说明），供 UI 渲染
 * @returns {Array<{id, name, edge, calc}>}
 */
function edgeTable() {
  return [
    { id: 'european-roulette', name: '欧式轮盘（单零，37格赔35:1）', edge: houseEdge('european-roulette'), calc: '1/37' },
    { id: 'american-roulette', name: '美式轮盘（双零，38格赔35:1）', edge: houseEdge('american-roulette'), calc: '2/38' },
    { id: 'baccarat-banker', name: '百家乐 押庄', edge: houseEdge('baccarat-banker'), calc: '-' },
    { id: 'baccarat-player', name: '百家乐 押闲', edge: houseEdge('baccarat-player'), calc: '-' },
    { id: 'baccarat-tie', name: '百家乐 押和', edge: houseEdge('baccarat-tie'), calc: '-' },
    { id: 'blackjack', name: '21点（基本策略）', edge: houseEdge('blackjack'), calc: '随规则浮动' },
    { id: 'slot-mid', name: '老虎机（hold）', edge: houseEdge('slot-mid'), calc: '5%～15%' }
  ];
}

/* ============================================================
 * 3. 标准正态分布 CDF（Abramowitz-Stegun erf 近似）
 * ============================================================ */

/**
 * 误差函数 erf(x) 的 Abramowitz-Stegun 近似
 * 精度约 1.5e-7
 * @param {number} x
 * @returns {number}
 */
function erf(x) {
  // 常数
  var a1 = 0.254829592;
  var a2 = -0.284496736;
  var a3 = 1.421413741;
  var a4 = -1.453152027;
  var a5 = 1.061405429;
  var p = 0.3275911;

  var sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  var t = 1.0 / (1.0 + p * x);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * 标准正态分布 CDF Φ(x)
 * @param {number} x
 * @returns {number} P(Z ≤ x)
 */
function normalCDF(x) {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

/* ============================================================
 * 4. 大数定律：玩家盈利概率
 * ============================================================ */

/**
 * 玩家在 n 手后盈利的概率
 * playerProfitProbability(edge, n, sigma) = Φ( -edge * sqrt(n) / sigma )
 *
 * 直觉：每手期望亏损 edge，n 手后期望总亏损 = edge*n，
 * 标准差 = sigma*sqrt(n)。盈利概率 = P(总收益 > 0)
 *       = Φ( -期望/标准差 ) = Φ( -edge*sqrt(n)/sigma )
 *
 * @param {number} edge - 庄家优势（小数，如 0.027）
 * @param {number} n - 手数
 * @param {number} sigma - 单手收益标准差，默认 1
 * @returns {number} 玩家盈利概率 [0, 1]
 */
function playerProfitProbability(edge, n, sigma) {
  if (sigma === undefined) sigma = 1;
  if (n <= 0) return 0.5;
  if (edge === 0) return 0.5;
  var z = -edge * Math.sqrt(n) / sigma;
  return normalCDF(z);
}

/**
 * 计算期望损失和收益标准差
 * @param {number} edge
 * @param {number} n
 * @param {number} sigma
 * @returns {{expectedLoss: number, stdDev: number, profitProb: number}}
 */
function llnStats(edge, n, sigma) {
  if (sigma === undefined) sigma = 1;
  return {
    expectedLoss: edge * n,
    stdDev: sigma * Math.sqrt(n),
    profitProb: playerProfitProbability(edge, n, sigma),
    snr: edge * Math.sqrt(n) / sigma // 信噪比 = 期望/标准差
  };
}

/**
 * 生成玩家盈利概率 vs n 的曲线数据点
 * @param {number} edge
 * @param {number} sigma
 * @param {number} numPoints - 采样点数
 * @returns {Array<{n: number, prob: number}>}
 */
function profitProbabilityCurve(edge, sigma, numPoints) {
  if (sigma === undefined) sigma = 1;
  if (!numPoints) numPoints = 100;
  var points = [];
  // 对数刻度 10 -> 1,000,000
  var logMin = Math.log(10);
  var logMax = Math.log(1000000);
  for (var i = 0; i < numPoints; i++) {
    var n = Math.round(Math.exp(logMin + (logMax - logMin) * i / (numPoints - 1)));
    points.push({ n: n, prob: playerProfitProbability(edge, n, sigma) });
  }
  return points;
}

/**
 * 蒙特卡洛模拟 n 手收益分布（生成直方图数据）
 * @param {number} edge
 * @param {number} n
 * @param {number} samples - 模拟次数
 * @param {function} rng - 随机数生成器
 * @returns {{results: number[], bins: Array, mean: number, std: number}}
 */
function simulateProfitDistribution(edge, n, samples, rng) {
  var rand = rng || Math.random;
  var p = (1 - edge) / 2; // 玩家单手胜率
  var results = [];

  if (n <= 10000) {
    // 直接模拟
    for (var i = 0; i < samples; i++) {
      var profit = 0;
      for (var j = 0; j < n; j++) {
        if (rand() < p) {
          profit += 1;
        } else {
          profit -= 1;
        }
      }
      results.push(profit);
    }
  } else {
    // 大 n 用正态近似：profit ~ N(-edge*n, n)
    var mean = -edge * n;
    var std = Math.sqrt(n);
    for (var i2 = 0; i2 < samples; i2++) {
      var u1 = rand() || 1e-10;
      var u2 = rand();
      var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      results.push(mean + z * std);
    }
  }

  // 统计量
  var sum = 0;
  for (var k = 0; k < results.length; k++) sum += results[k];
  var sampleMean = sum / results.length;
  var sqSum = 0;
  for (var m = 0; m < results.length; m++) sqSum += (results[m] - sampleMean) * (results[m] - sampleMean);
  var sampleStd = Math.sqrt(sqSum / results.length);

  // 直方图分桶
  var sorted = results.slice().sort(function (a, b) { return a - b; });
  var min = sorted[0];
  var max = sorted[sorted.length - 1];
  var numBins = Math.min(40, Math.max(10, Math.floor(Math.sqrt(samples))));
  var range = max - min || 1;
  var binWidth = range / numBins;
  var bins = [];
  for (var b = 0; b < numBins; b++) {
    var lo = min + b * binWidth;
    var hi = min + (b + 1) * binWidth;
    var count = 0;
    for (var c = 0; c < results.length; c++) {
      if (b === numBins - 1) {
        if (results[c] >= lo && results[c] <= hi) count++;
      } else {
        if (results[c] >= lo && results[c] < hi) count++;
      }
    }
    bins.push({ lo: lo, hi: hi, count: count, label: Math.round((lo + hi) / 2) });
  }

  return { results: results, bins: bins, mean: sampleMean, std: sampleStd, min: min, max: max };
}

/* ============================================================
 * 5. 赌徒破产：解析解 + 蒙特卡洛
 * ============================================================ */

/**
 * 赌徒破产概率（解析解）
 *
 * 玩家本金 W，庄家本金 B，每手 ±1，玩家胜率 p = (1-edge)/2
 * - p = 0.5（公平）：破产概率 = B / (W + B)
 * - p ≠ 0.5：破产概率 = (r^(W+B) - r^W) / (r^(W+B) - 1)，r = q/p
 *   其中 q = 1 - p
 *
 * 大额情形用对数空间计算避免溢出。
 *
 * @param {number} playerBank - 玩家本金（以单手下注为单位）
 * @param {number} houseBank - 庄家本金
 * @param {number} edge - 庄家优势（小数）
 * @returns {number} 玩家破产概率 [0, 1]
 */
function gamblerRuinProbability(playerBank, houseBank, edge) {
  var W = playerBank;
  var B = houseBank;
  var N = W + B;

  if (edge === 0) {
    // 公平游戏
    return B / N;
  }

  var p = (1 - edge) / 2;
  var q = 1 - p;
  var r = q / p;          // edge > 0 时 r > 1；edge < 0（玩家有优势）时 r < 1
  var lnR = Math.log(r);

  // 基础式：ruinProb = (r^N - r^W) / (r^N - 1)
  // 直接算 r^N 在 N 很大时会溢出，所以按 lnR 的符号选一种「指数恒为负」的等价变形。

  if (lnR > 0) {
    // 庄家有优势。分子分母同除 r^N：
    // = (1 - r^(W-N)) / (1 - r^(-N)) = (1 - exp(-B*lnR)) / (1 - exp(-N*lnR))
    var expNegB = Math.exp(-B * lnR);
    var expNegN = Math.exp(-N * lnR);
    if (expNegN < 1e-15) {
      return 1.0 - expNegB;   // exp(-N*lnR) -> 0，破产几乎必然
    }
    return (1 - expNegB) / (1 - expNegN);
  }

  // 玩家有优势（edge < 0）。此时 r < 1，直接用正指数形式，两个 exp 都 ≤ 1：
  // = (r^W - r^N) / (1 - r^N)
  var expW = Math.exp(W * lnR);
  var expN = Math.exp(N * lnR);
  if (expN < 1e-15) {
    return expW;              // 上界实际不可达，破产概率收敛到 r^W
  }
  return (expW - expN) / (1 - expN);
}

/**
 * 蒙特卡洛模拟单个赌徒的破产过程
 *
 * @param {number} playerBank - 玩家本金
 * @param {number} houseBank - 庄家本金
 * @param {number} edge - 庄家优势
 * @param {function} rng - 随机数生成器
 * @param {number} maxRounds - 最大轮数（防止无限循环）
 * @returns {{bankrupt: boolean, rounds: number, trajectory: number[]}}
 */
function simulateGamblerRuin(playerBank, houseBank, edge, rng, maxRounds) {
  var rand = rng || Math.random;
  if (!maxRounds) maxRounds = 1000000;
  var p = (1 - edge) / 2;
  var W = playerBank;
  var B = houseBank;
  var capital = W;
  var trajectory = [capital];
  var rounds = 0;

  while (capital > 0 && capital < W + B && rounds < maxRounds) {
    if (rand() < p) {
      capital += 1;
    } else {
      capital -= 1;
    }
    trajectory.push(capital);
    rounds++;
  }

  var bankrupt = capital <= 0;
  var hitCeiling = capital >= W + B;

  return {
    bankrupt: bankrupt,
    hitCeiling: hitCeiling,
    // absorbed=false 表示在 maxRounds 内既没破产也没触顶，属于「未定局」，
    // 不能当成存活来统计，否则会把庄家资金极大的场景误报成 0% 破产。
    absorbed: bankrupt || hitCeiling,
    rounds: rounds,
    trajectory: trajectory,
    finalCapital: capital
  };
}

/**
 * 批量模拟赌徒破产，返回破产率与统计
 *
 * @param {number} count - 模拟人数
 * @param {number} playerBank
 * @param {number} houseBank
 * @param {number} edge
 * @param {function} rng
 * @returns {{ruinCount: number, ruinRate: number, survivalRate: number, trajectories: number[][], avgRounds: number}}
 */
function simulateGamblers(count, playerBank, houseBank, edge, rng, opts) {
  var rand = rng || Math.random;
  opts = opts || {};

  // 总步数预算：庄家资金极大 / edge 极小时，走到吸收需要上千万步，
  // 不设预算会把主线程锁死几分钟。预算内没定局的样本单独归类。
  var stepBudget = opts.stepBudget || 150000000;
  var maxRounds = opts.maxRounds || Math.max(1000, Math.floor(stepBudget / Math.max(1, count)));
  var keepTrajectories = opts.keepTrajectories === undefined ? 5 : opts.keepTrajectories;

  var ruinCount = 0;
  var ceilingCount = 0;
  var unabsorbedCount = 0;
  var trajectories = [];
  var totalRounds = 0;

  for (var i = 0; i < count; i++) {
    var result = simulateGamblerRuin(playerBank, houseBank, edge, rand, maxRounds);
    if (result.bankrupt) ruinCount++;
    else if (result.hitCeiling) ceilingCount++;
    else unabsorbedCount++;
    totalRounds += result.rounds;

    // 只保留少量轨迹用于绘制，避免大批量模拟时内存爆炸。
    // 抽稀后必须把步长带出去，否则画图时会把「第 k 个采样点」当成「第 k 手」。
    if (trajectories.length < keepTrajectories) {
      var points = result.trajectory;
      var stride = 1;
      if (points.length > 200) {
        stride = Math.ceil(points.length / 200);
        var sampled = [];
        for (var j = 0; j < points.length; j += stride) sampled.push(points[j]);
        points = sampled;
      }
      trajectories.push({
        points: points,
        stride: stride,
        rounds: result.rounds,
        bankrupt: result.bankrupt,
        absorbed: result.absorbed
      });
    }
  }

  var absorbedCount = ruinCount + ceilingCount;

  return {
    ruinCount: ruinCount,
    ceilingCount: ceilingCount,
    unabsorbedCount: unabsorbedCount,
    absorbedCount: absorbedCount,
    // ruinRate 以全部样本为分母（向后兼容）
    ruinRate: ruinCount / count,
    // 与解析解对照时应该用这个：只在已定局的样本里算破产占比
    ruinRateAmongAbsorbed: absorbedCount > 0 ? ruinCount / absorbedCount : null,
    survivalRate: ceilingCount / count,
    truncated: unabsorbedCount > 0,
    maxRounds: maxRounds,
    trajectories: trajectories,
    avgRounds: totalRounds / count,
    count: count
  };
}

/* ============================================================
 * 6. 倍投（马丁格尔）模拟
 * ============================================================ */

/**
 * 模拟一次马丁格尔策略
 *
 * @param {Object} params
 * @param {number} params.bankroll - 初始本金
 * @param {number} params.baseBet - 基础下注额
 * @param {number} params.tableLimit - 桌限（Infinity 表示无桌限）
 * @param {number} params.edge - 庄家优势
 * @param {number} params.rounds - 总手数
 * @param {function} rng - 随机数生成器
 * @returns {{
 *   trajectory: number[],
 *   betSequence: number[],
 *   bankrupt: boolean,
 *   truncatedRounds: number[],
 *   finalBankroll: number,
 *   maxBet: number,
 *   wins: number,
 *   losses: number
 * }}
 */
function simulateMartingale(params, rng) {
  var rand = rng || Math.random;
  var bankroll = params.bankroll;
  var baseBet = params.baseBet;
  var tableLimit = params.tableLimit !== undefined ? params.tableLimit : Infinity;
  var edge = params.edge;
  var rounds = params.rounds;
  var p = (1 - edge) / 2; // 玩家胜率

  // profitTarget：赚到「初始本金 + profitTarget」就收手离场。
  // 倍投真正承诺的是「小额目标几乎必然达成」，所以这才是该被检验的指标。
  var profitTarget = params.profitTarget;
  var hasTarget = typeof profitTarget === 'number' && profitTarget > 0;
  var targetBankroll = bankroll + (hasTarget ? profitTarget : 0);
  var startBankroll = bankroll;

  var currentBet = baseBet;
  var trajectory = [bankroll];
  var betSequence = [];
  var truncatedRounds = [];
  var wins = 0;
  var losses = 0;
  var maxBet = 0;
  var totalWagered = 0;   // 总流水：期望亏损 = 庄家优势 × 总流水
  var bankrupt = false;
  var reachedTarget = false;

  for (var i = 0; i < rounds; i++) {
    if (hasTarget && bankroll >= targetBankroll) {
      reachedTarget = true;
      break;
    }
    // 先应用桌限截断
    var desiredBet = currentBet;
    var actualBet = desiredBet;
    var truncated = false;
    if (desiredBet > tableLimit) {
      actualBet = tableLimit;
      truncated = true;
      truncatedRounds.push(i);
    }

    // 检查本金能否覆盖实际下注额
    if (actualBet > bankroll) {
      bankrupt = true;
      break;
    }

    if (actualBet > maxBet) maxBet = actualBet;
    totalWagered += actualBet;
    betSequence.push({ round: i, desiredBet: desiredBet, actualBet: actualBet, truncated: truncated });

    // 下注
    if (rand() < p) {
      bankroll += actualBet;
      wins++;
      currentBet = baseBet; // 赢了重置
    } else {
      bankroll -= actualBet;
      losses++;
      if (truncated) {
        // 被截断后无法完全翻倍，保持桌限或重置
        currentBet = baseBet; // 桌限截断后策略已失效，重置
      } else {
        currentBet = currentBet * 2; // 输了翻倍
      }
    }

    trajectory.push(bankroll);

    if (bankroll <= 0) {
      bankrupt = true;
      break;
    }
  }

  if (hasTarget && !bankrupt && bankroll >= targetBankroll) reachedTarget = true;

  return {
    trajectory: trajectory,
    betSequence: betSequence,
    bankrupt: bankrupt,
    reachedTarget: reachedTarget,
    truncatedRounds: truncatedRounds,
    finalBankroll: bankroll,
    netProfit: bankroll - startBankroll,
    totalWagered: totalWagered,
    maxBet: maxBet,
    wins: wins,
    losses: losses,
    rounds: i
  };
}

/**
 * 批量跑马丁格尔，返回破产率
 *
 * @param {number} count - 模拟次数
 * @param {Object} params - 同 simulateMartingale
 * @param {function} rng
 * @returns {{ruinRate: number, ruinCount: number, results: Array}}
 */
function simulateMartingaleBatch(count, params, rng) {
  var rand = rng || Math.random;
  var ruinCount = 0;
  var targetCount = 0;
  var profitSum = 0;
  var wageredSum = 0;
  var worstProfit = Infinity;
  var results = [];
  for (var i = 0; i < count; i++) {
    var r = simulateMartingale(params, rand);
    results.push(r);
    if (r.bankrupt) ruinCount++;
    if (r.reachedTarget) targetCount++;
    profitSum += r.netProfit;
    wageredSum += r.totalWagered;
    if (r.netProfit < worstProfit) worstProfit = r.netProfit;
  }
  return {
    ruinRate: ruinCount / count,
    ruinCount: ruinCount,
    // 达成目标的比例：模块四用它做「桌限前 vs 桌限后」的受控对照
    targetCount: targetCount,
    targetRate: targetCount / count,
    avgProfit: profitSum / count,
    avgWagered: wageredSum / count,
    // 理论期望亏损 = 庄家优势 × 总流水。桌限改变亏损的分布形状，改不了这一行。
    theoreticalLoss: -(params.edge) * (wageredSum / count),
    worstProfit: worstProfit === Infinity ? 0 : worstProfit,
    survivalRate: 1 - ruinCount / count,
    results: results,
    count: count
  };
}

/* ============================================================
 * 7. 体育博彩平衡账本
 * ============================================================ */

/**
 * 计算庄家在不同结果下的净收益
 *
 * @param {number} amountA - A 队押注总额
 * @param {number} amountB - B 队押注总额
 * @param {number} oddsA - A 队十进制赔率（如 1.9 表示下注 1 返还 1.9）
 * @param {number} oddsB - B 队十进制赔率
 * @returns {{
 *   netA: number,        - A 赢时庄家净收益
 *   netB: number,        - B 赢时庄家净收益
 *   vig: number,         - 抽水率（overround）
 *   totalPool: number,   - 总押注池
 *   balanced: boolean,   - 是否平衡
 *   exposure: string     - 风险描述
 * }}
 */
function bookmakerPayout(amountA, amountB, oddsA, oddsB) {
  var totalPool = amountA + amountB;
  var netA = totalPool - amountA * oddsA;
  var netB = totalPool - amountB * oddsB;
  var vig = (1 / oddsA + 1 / oddsB) - 1; // overround
  var diff = Math.abs(netA - netB);
  var balanced = diff < totalPool * 0.01; // 差异小于总池 1% 视为平衡

  var exposure;
  if (netA < 0 || netB < 0) {
    exposure = 'imbalance';
  } else if (balanced) {
    exposure = 'balanced';
  } else {
    exposure = 'tilted';
  }

  return {
    netA: netA,
    netB: netB,
    vig: vig,
    totalPool: totalPool,
    balanced: balanced,
    exposure: exposure
  };
}

/**
 * 按两侧押注额反解「平衡账本」的赔率
 *
 * 庄家开盘的目的不是预测比分，而是让两侧押注额乘以各自赔率后相等，
 * 于是无论谁赢，赔付都一样，庄家只收 vig。
 *
 * 令 totalPool = A + B，目标是两侧赔付都等于 totalPool * (1 - vig)：
 *   oddsA = totalPool * (1 - vig) / amountA
 *   oddsB = totalPool * (1 - vig) / amountB
 *
 * @param {number} amountA - A 侧押注总额
 * @param {number} amountB - B 侧押注总额
 * @param {number} vig - 目标抽水率（如 0.05 表示留 5%）
 * @returns {{oddsA: number, oddsB: number, payout: number, impliedVig: number}|null}
 */
function balancedOdds(amountA, amountB, vig) {
  if (vig === undefined) vig = 0.05;
  if (amountA <= 0 || amountB <= 0) return null;
  var totalPool = amountA + amountB;
  var payout = totalPool * (1 - vig);
  var oddsA = payout / amountA;
  var oddsB = payout / amountB;
  return {
    oddsA: oddsA,
    oddsB: oddsB,
    payout: payout,
    impliedVig: (1 / oddsA + 1 / oddsB) - 1
  };
}

/* ============================================================
 * 模块导出
 * ============================================================ */

var BH_ENGINE_API = {
  mulberry32: mulberry32,
  houseEdge: houseEdge,
  edgeTable: edgeTable,
  erf: erf,
  normalCDF: normalCDF,
  playerProfitProbability: playerProfitProbability,
  llnStats: llnStats,
  profitProbabilityCurve: profitProbabilityCurve,
  simulateProfitDistribution: simulateProfitDistribution,
  gamblerRuinProbability: gamblerRuinProbability,
  simulateGamblerRuin: simulateGamblerRuin,
  simulateGamblers: simulateGamblers,
  simulateMartingale: simulateMartingale,
  simulateMartingaleBatch: simulateMartingaleBatch,
  bookmakerPayout: bookmakerPayout,
  balancedOdds: balancedOdds
};

// 浏览器：显式挂命名空间，不依赖顶层函数隐式变成全局变量
if (typeof window !== 'undefined') {
  window.bhEngine = BH_ENGINE_API;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BH_ENGINE_API;
}
