/**
 * 帕隆多悖论核心算法
 * Parrondo's Paradox — Core Logic
 *
 * 经典设定 (M=3, ε=0.005):
 *   Game A: 抛硬币，赢的概率 = 0.5 - ε = 0.495（必输）
 *   Game B: 如果资金是 M 的倍数，用 Coin 2（赢的概率 = 0.1 - ε = 0.095）
 *           否则用 Coin 3（赢的概率 = 0.75 - ε = 0.745）
 *   赢 +1，输 -1
 */

// === 默认参数 ===
const DEFAULT_PARAMS = {
  epsilon: 0.005,
  M: 3,
  pA: null,       // 自动计算: 0.5 - epsilon
  pB_good: null,  // 自动计算: 0.75 - epsilon
  pB_bad: null    // 自动计算: 0.1 - epsilon
};

function getParams(opts = {}) {
  const epsilon = opts.epsilon ?? DEFAULT_PARAMS.epsilon;
  const M = opts.M ?? DEFAULT_PARAMS.M;
  return {
    epsilon,
    M,
    pA: opts.pA ?? (0.5 - epsilon),
    pB_good: opts.pB_good ?? (0.75 - epsilon),
    pB_bad: opts.pB_bad ?? (0.1 - epsilon)
  };
}

// === 单步游戏 ===
function playGameA(params) {
  return Math.random() < params.pA ? 1 : -1;
}

function playGameB(capital, params) {
  const p = (capital % params.M === 0) ? params.pB_bad : params.pB_good;
  return Math.random() < p ? 1 : -1;
}

// === 策略模式 ===
// 返回每一步应该玩的游戏: 'A' 或 'B'
function getGameForStep(step, pattern) {
  if (pattern === 'A') return 'A';
  if (pattern === 'B') return 'B';
  if (pattern === 'AB') return step % 2 === 0 ? 'A' : 'B';
  if (pattern === 'AABB') return (step % 4 < 2) ? 'A' : 'B';
  if (pattern === 'ABB') return (step % 3 === 0) ? 'A' : 'B';
  if (pattern === 'RANDOM') return Math.random() < 0.5 ? 'A' : 'B';
  // 自定义模式字符串，如 "AABBB"
  if (typeof pattern === 'string' && pattern.length > 0) {
    return pattern[step % pattern.length];
  }
  return 'A';
}

// === 单次模拟 ===
// 返回 { history: [capital0, capital1, ...], finalCapital }
function simulateOnce(steps, pattern, opts = {}) {
  const params = getParams(opts);
  let capital = 0;
  const history = [0];

  for (let i = 0; i < steps; i++) {
    const game = getGameForStep(i, pattern);
    const result = (game === 'A') ? playGameA(params) : playGameB(capital, params);
    capital += result;
    history.push(capital);
  }

  return { history, finalCapital: capital };
}

// === 批量模拟（蒙特卡洛） ===
// 返回 { avgHistory, finalCapitals, meanFinal, medianFinal, winRate }
function simulateMonteCarlo(trials, steps, pattern, opts = {}) {
  const allHistories = [];
  const finalCapitals = [];

  for (let t = 0; t < trials; t++) {
    const { history, finalCapital } = simulateOnce(steps, pattern, opts);
    allHistories.push(history);
    finalCapitals.push(finalCapital);
  }

  // 计算平均轨迹
  const avgHistory = new Array(steps + 1).fill(0);
  for (let i = 0; i <= steps; i++) {
    let sum = 0;
    for (let t = 0; t < trials; t++) {
      sum += allHistories[t][i];
    }
    avgHistory[i] = sum / trials;
  }

  const meanFinal = finalCapitals.reduce((s, v) => s + v, 0) / trials;
  const sorted = [...finalCapitals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianFinal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const winRate = finalCapitals.filter(c => c > 0).length / trials;

  return {
    avgHistory,
    finalCapitals,
    meanFinal: Math.round(meanFinal * 100) / 100,
    medianFinal,
    winRate: Math.round(winRate * 10000) / 100
  };
}

// === 理论稳态概率（Game B 的马尔可夫链分析，M=3） ===
// 返回使用 bad coin 的稳态概率
function gameB_stationaryBadCoinProb(opts = {}) {
  const params = getParams(opts);
  if (params.M !== 3) return null; // 仅支持 M=3 的解析解

  const pg = params.pB_good;
  const pb = params.pB_bad;
  const qg = 1 - pg;
  const qb = 1 - pb;

  // 稳态: state 0 (capital%3==0) 的概率
  // 转移矩阵分析得到:
  // π0 = (qg*pg + qg*qg) / (pg*pg + qg*pg + qg*qg + pg*qg)
  // 简化: π0 = qg / (pg + qg) = qg (因为 pg+qg=1)... 不对
  // 实际需要解 3x3 马尔可夫链
  // state 0 -> win -> state 1, lose -> state 2
  // state 1 -> win -> state 2, lose -> state 0
  // state 2 -> win -> state 0, lose -> state 1
  // P(state 0 用 bad coin, state 1,2 用 good coin)

  // 转移矩阵 T[i][j] = P(go from state i to state j)
  // state 0: P(0->1) = pb, P(0->2) = qb
  // state 1: P(1->2) = pg, P(1->0) = qg
  // state 2: P(2->0) = pg, P(2->1) = qg

  // 稳态方程:
  // π0 = π1*qg + π2*pg
  // π1 = π0*pb + π2*qg
  // π2 = π0*qb + π1*pg
  // π0 + π1 + π2 = 1

  // 解方程组
  // 从第三个: π2 = qb*π0 + pg*π1
  // 代入第一个: π0 = qg*π1 + pg*(qb*π0 + pg*π1)
  //           π0 = qg*π1 + pg*qb*π0 + pg*pg*π1
  //           π0*(1 - pg*qb) = π1*(qg + pg*pg)
  //           π1 = π0*(1 - pg*qb) / (qg + pg*pg)

  const denom1 = qg + pg * pg;
  const pi1_over_pi0 = (1 - pg * qb) / denom1;
  const pi2_over_pi0 = qb + pg * pi1_over_pi0;

  const pi0 = 1 / (1 + pi1_over_pi0 + pi2_over_pi0);

  // Game B 的期望收益 = π0*(pb - qb) + (1-π0)*(pg - qg)
  const expectedB = pi0 * (pb - qb) + (1 - pi0) * (pg - qg);

  return {
    pi0: Math.round(pi0 * 10000) / 10000,
    expectedPerStep: Math.round(expectedB * 10000) / 10000
  };
}

// === 多策略对比 ===
function compareStrategies(trials, steps, strategies, opts = {}) {
  const results = {};
  for (const s of strategies) {
    results[s] = simulateMonteCarlo(trials, steps, s, opts);
  }
  return results;
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getParams, playGameA, playGameB, getGameForStep,
    simulateOnce, simulateMonteCarlo,
    gameB_stationaryBadCoinProb, compareStrategies,
    DEFAULT_PARAMS
  };
}
