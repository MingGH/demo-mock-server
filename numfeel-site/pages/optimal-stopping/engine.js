// ========== 最优停止 / 37%法则 核心算法（可独立测试） ==========

/**
 * 生成 n 个候选人评分（1~100 之间的不重复整数）
 */
function generateCandidates(n) {
  var pool = [];
  for (var i = 1; i <= 100; i++) pool.push(i);
  // Fisher-Yates shuffle
  for (var j = pool.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
  }
  return pool.slice(0, n);
}

/**
 * 37% 法则策略：跳过前 r 个，然后选第一个比前 r 个都好的
 * @param {number[]} candidates - 候选人评分数组
 * @param {number} r - 跳过的数量（观察期）
 * @returns {{ chosen: number, index: number, isBest: boolean }}
 */
function optimalStoppingStrategy(candidates, r) {
  var n = candidates.length;
  if (r >= n) {
    // 全部跳过，只能选最后一个
    return {
      chosen: candidates[n - 1],
      index: n - 1,
      isBest: candidates[n - 1] === Math.max.apply(null, candidates)
    };
  }

  // 找前 r 个中的最大值
  var threshold = -Infinity;
  for (var i = 0; i < r; i++) {
    if (candidates[i] > threshold) threshold = candidates[i];
  }

  // 从第 r+1 个开始，选第一个超过 threshold 的
  for (var j = r; j < n; j++) {
    if (candidates[j] > threshold) {
      return {
        chosen: candidates[j],
        index: j,
        isBest: candidates[j] === Math.max.apply(null, candidates)
      };
    }
  }

  // 没有超过的，选最后一个
  return {
    chosen: candidates[n - 1],
    index: n - 1,
    isBest: candidates[n - 1] === Math.max.apply(null, candidates)
  };
}

/**
 * 随机策略：随机选一个
 */
function randomStrategy(candidates) {
  var idx = Math.floor(Math.random() * candidates.length);
  return {
    chosen: candidates[idx],
    index: idx,
    isBest: candidates[idx] === Math.max.apply(null, candidates)
  };
}

/**
 * 立刻选策略：选第一个
 */
function firstStrategy(candidates) {
  return {
    chosen: candidates[0],
    index: 0,
    isBest: candidates[0] === Math.max.apply(null, candidates)
  };
}

/**
 * 一直等策略：一直等到最后一个
 */
function lastStrategy(candidates) {
  var n = candidates.length;
  return {
    chosen: candidates[n - 1],
    index: n - 1,
    isBest: candidates[n - 1] === Math.max.apply(null, candidates)
  };
}

/**
 * 蒙特卡洛模拟：对比不同策略的成功率
 * @param {number} n - 候选人数量
 * @param {number} simCount - 模拟次数
 * @returns {{ optimal: number, random: number, first: number, last: number, optimalR: number }}
 */
function runSimulation(n, simCount) {
  var r = Math.max(1, Math.round(n / Math.E));
  var optWins = 0, randWins = 0, firstWins = 0, lastWins = 0;

  for (var i = 0; i < simCount; i++) {
    var candidates = generateCandidates(n);
    if (optimalStoppingStrategy(candidates, r).isBest) optWins++;
    if (randomStrategy(candidates).isBest) randWins++;
    if (firstStrategy(candidates).isBest) firstWins++;
    if (lastStrategy(candidates).isBest) lastWins++;
  }

  return {
    optimal: optWins / simCount,
    random: randWins / simCount,
    first: firstWins / simCount,
    last: lastWins / simCount,
    optimalR: r
  };
}

/**
 * 扫描不同跳过比例的成功率
 * @param {number} n - 候选人数量
 * @param {number} simCount - 每个比例的模拟次数
 * @returns {{ ratios: number[], rates: number[], bestRatio: number, bestRate: number }}
 */
function scanSkipRatios(n, simCount) {
  var ratios = [];
  var rates = [];
  var bestRatio = 0;
  var bestRate = 0;

  for (var pct = 0; pct <= 100; pct += 2) {
    var r = Math.round(n * pct / 100);
    var wins = 0;
    for (var i = 0; i < simCount; i++) {
      var candidates = generateCandidates(n);
      if (optimalStoppingStrategy(candidates, r).isBest) wins++;
    }
    var rate = wins / simCount;
    ratios.push(pct);
    rates.push(rate);
    if (rate > bestRate) {
      bestRate = rate;
      bestRatio = pct;
    }
  }

  return { ratios: ratios, rates: rates, bestRatio: bestRatio, bestRate: bestRate };
}

/**
 * 理论最优跳过数量
 */
function theoreticalOptimalR(n) {
  return Math.max(1, Math.round(n / Math.E));
}

/**
 * 理论成功概率（大 n 时趋近 1/e ≈ 36.8%）
 * 精确公式：P(r,n) = (r/n) * Σ_{i=r}^{n-1} 1/(i) 对 i 从 r 到 n-1
 */
function theoreticalSuccessRate(n, r) {
  if (r === 0) return 1 / n;
  if (r >= n) return 1 / n;
  var sum = 0;
  for (var i = r; i < n; i++) {
    sum += 1 / i;
  }
  return (r / n) * sum;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateCandidates: generateCandidates,
    optimalStoppingStrategy: optimalStoppingStrategy,
    randomStrategy: randomStrategy,
    firstStrategy: firstStrategy,
    lastStrategy: lastStrategy,
    runSimulation: runSimulation,
    scanSkipRatios: scanSkipRatios,
    theoreticalOptimalR: theoreticalOptimalR,
    theoreticalSuccessRate: theoreticalSuccessRate
  };
}
